import { Injectable } from '@nestjs/common';
import { FeriadosService } from './feriados.service';
import { ConfiguracoesDiasUteisService } from './configuracoes-dias-uteis.service';
import { VerificarDiaUtilDto, ProximosDiasUteisDto } from './dto';

export interface DiaUtilResponse {
  data: Date;
  ehDiaUtil: boolean;
  ehFeriado: boolean;
  nomeFeriado?: string;
  diaSemana: string;
  configuracao?: {
    id: string;
    nome: string;
  };
}

export interface ProximosDiasUteisResponse {
  diasUteis: Date[];
  diasEncontrados: number;
  dataInicio: Date;
  configuracaoUsada?: {
    id: string;
    nome: string;
  };
}

@Injectable()
export class AgendaService {
  private readonly diasSemana = [
    'Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'
  ];

  constructor(
    private readonly feriadosService: FeriadosService,
    private readonly configuracoesService: ConfiguracoesDiasUteisService
  ) {}

  async verificarDiaUtil(dto: VerificarDiaUtilDto): Promise<DiaUtilResponse> {
    const { data, plantaId } = dto;

    // Verificar se é feriado
    const ehFeriado = await this.feriadosService.verificarFeriado(data, plantaId);

    // Obter configuração de dias úteis
    const configuracao = await this.configuracoesService.obterConfiguracaoPorPlanta(plantaId);

    // Verificar se o dia da semana é útil pela configuração
    const diaSemana = data.getDay(); // 0 = Domingo, 1 = Segunda, etc.
    let ehDiaUtilPorConfiguracao = true;

    if (configuracao) {
      switch (diaSemana) {
        case 0: // Domingo
          ehDiaUtilPorConfiguracao = configuracao.domingo;
          break;
        case 1: // Segunda
          ehDiaUtilPorConfiguracao = configuracao.segunda;
          break;
        case 2: // Terça
          ehDiaUtilPorConfiguracao = configuracao.terca;
          break;
        case 3: // Quarta
          ehDiaUtilPorConfiguracao = configuracao.quarta;
          break;
        case 4: // Quinta
          ehDiaUtilPorConfiguracao = configuracao.quinta;
          break;
        case 5: // Sexta
          ehDiaUtilPorConfiguracao = configuracao.sexta;
          break;
        case 6: // Sábado
          ehDiaUtilPorConfiguracao = configuracao.sabado;
          break;
      }
    } else {
      // Configuração padrão: Segunda a Sexta
      ehDiaUtilPorConfiguracao = diaSemana >= 1 && diaSemana <= 5;
    }

    // É dia útil se não for feriado E se for dia útil pela configuração
    const ehDiaUtil = !ehFeriado && ehDiaUtilPorConfiguracao;

    return {
      data,
      ehDiaUtil,
      ehFeriado,
      diaSemana: this.diasSemana[diaSemana],
      configuracao: configuracao ? {
        id: configuracao.id,
        nome: configuracao.nome
      } : undefined
    };
  }

  async obterProximosDiasUteis(dto: ProximosDiasUteisDto): Promise<ProximosDiasUteisResponse> {
    const { quantidade, dataInicio = new Date(), plantaId } = dto;

    const diasUteis: Date[] = [];
    let dataAtual = new Date(dataInicio);
    let tentativas = 0;
    const maxTentativas = quantidade * 10; // Evitar loop infinito

    // Obter configuração uma vez
    const configuracao = await this.configuracoesService.obterConfiguracaoPorPlanta(plantaId);

    while (diasUteis.length < quantidade && tentativas < maxTentativas) {
      const resultado = await this.verificarDiaUtil({
        data: new Date(dataAtual),
        plantaId
      });

      if (resultado.ehDiaUtil) {
        diasUteis.push(new Date(dataAtual));
      }

      // Avançar para o próximo dia
      dataAtual.setDate(dataAtual.getDate() + 1);
      tentativas++;
    }

    return {
      diasUteis,
      diasEncontrados: diasUteis.length,
      dataInicio: new Date(dataInicio),
      configuracaoUsada: configuracao ? {
        id: configuracao.id,
        nome: configuracao.nome
      } : undefined
    };
  }

  async calcularDiasUteisEntreDatas(
    dataInicio: Date,
    dataFim: Date,
    plantaId?: string
  ): Promise<number> {
    let contador = 0;
    const dataAtual = new Date(dataInicio);

    while (dataAtual <= dataFim) {
      const resultado = await this.verificarDiaUtil({
        data: new Date(dataAtual),
        plantaId
      });

      if (resultado.ehDiaUtil) {
        contador++;
      }

      dataAtual.setDate(dataAtual.getDate() + 1);
    }

    return contador;
  }

  async adicionarDiasUteis(
    dataBase: Date,
    diasUteis: number,
    plantaId?: string
  ): Promise<Date> {
    let dataAtual = new Date(dataBase);
    let diasAdicionados = 0;
    let tentativas = 0;
    const maxTentativas = diasUteis * 10;

    while (diasAdicionados < diasUteis && tentativas < maxTentativas) {
      dataAtual.setDate(dataAtual.getDate() + 1);

      const resultado = await this.verificarDiaUtil({
        data: new Date(dataAtual),
        plantaId
      });

      if (resultado.ehDiaUtil) {
        diasAdicionados++;
      }

      tentativas++;
    }

    return new Date(dataAtual);
  }

  async obterCalendarioMes(
    ano: number,
    mes: number,
    plantaId?: string
  ): Promise<DiaUtilResponse[]> {
    const calendario: DiaUtilResponse[] = [];
    const primeiroDia = new Date(ano, mes - 1, 1);
    const ultimoDia = new Date(ano, mes, 0);

    for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
      const data = new Date(ano, mes - 1, dia);
      const resultado = await this.verificarDiaUtil({ data, plantaId });
      calendario.push(resultado);
    }

    return calendario;
  }
}