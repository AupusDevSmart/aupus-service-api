import { Controller, Get, Param, Query, Logger } from '@nestjs/common';
import { EquipamentosDadosService } from './equipamentos-dados.service';
import { CalculoCustosService } from './services/calculo-custos.service';
import { EquipamentoDadosQueryDto } from './dto/equipamento-dados-query.dto';
import { CustosEnergiaQueryDto, PeriodoTipo } from './dto/custos-energia-query.dto';

@Controller('equipamentos-dados')
export class EquipamentosDadosController {
  private readonly logger = new Logger(EquipamentosDadosController.name);

  constructor(
    private readonly service: EquipamentosDadosService,
    private readonly custosService: CalculoCustosService,
  ) {}

  /**
   * GET /equipamentos-dados/:id/latest
   * Retorna o dado mais recente de um equipamento
   */
  @Get(':id/latest')
  async getLatest(@Param('id') id: string) {
    this.logger.log(`GET /equipamentos-dados/${id}/latest`);
    return this.service.findLatest(id);
  }

  /**
   * GET /equipamentos-dados/:id/history
   * Retorna o histórico de dados de um equipamento
   */
  @Get(':id/history')
  async getHistory(
    @Param('id') id: string,
    @Query() query: EquipamentoDadosQueryDto,
  ) {
    this.logger.log(`GET /equipamentos-dados/${id}/history`);
    return this.service.findHistory(id, query);
  }

  /**
   * GET /equipamentos-dados/:id/stats
   * Retorna estatísticas de dados de um equipamento
   */
  @Get(':id/stats')
  async getStats(@Param('id') id: string) {
    this.logger.log(`GET /equipamentos-dados/${id}/stats`);
    return this.service.getStats(id);
  }

  /**
   * GET /equipamentos-dados/:id/grafico-dia
   * Retorna dados para gráfico do dia (curva de potência)
   */
  @Get(':id/grafico-dia')
  async getGraficoDia(
    @Param('id') id: string,
    @Query('data') data?: string, // formato: YYYY-MM-DD (opcional, default: hoje)
  ) {
    this.logger.log(`GET /equipamentos-dados/${id}/grafico-dia?data=${data || 'hoje'}`);
    return this.service.getGraficoDia(id, data);
  }

  /**
   * GET /equipamentos-dados/:id/grafico-mes
   * Retorna dados para gráfico do mês (energia por dia)
   */
  @Get(':id/grafico-mes')
  async getGraficoMes(
    @Param('id') id: string,
    @Query('mes') mes?: string, // formato: YYYY-MM (opcional, default: mês atual)
  ) {
    this.logger.log(`GET /equipamentos-dados/${id}/grafico-mes?mes=${mes || 'atual'}`);
    return this.service.getGraficoMes(id, mes);
  }

  /**
   * GET /equipamentos-dados/:id/grafico-ano
   * Retorna dados para gráfico do ano (energia por mês)
   */
  @Get(':id/grafico-ano')
  async getGraficoAno(
    @Param('id') id: string,
    @Query('ano') ano?: string, // formato: YYYY (opcional, default: ano atual)
  ) {
    this.logger.log(`GET /equipamentos-dados/${id}/grafico-ano?ano=${ano || 'atual'}`);
    return this.service.getGraficoAno(id, ano);
  }

  /**
   * GET /equipamentos-dados/:id/custos-energia
   * Retorna cálculo de custos de energia para um equipamento M160
   * Suporta filtros de período (dia ou mês)
   */
  @Get(':id/custos-energia')
  async getCustosEnergia(
    @Param('id') id: string,
    @Query() query: CustosEnergiaQueryDto,
  ) {
    this.logger.log(
      `GET /equipamentos-dados/${id}/custos-energia?periodo=${query.periodo}&data=${query.data || 'atual'}`,
    );

    // Determinar range de datas com base no período
    const { dataInicio, dataFim } = this.calcularRangeDatas(query);

    this.logger.log(
      `📊 [CUSTOS] Calculando custos para equipamento ${id} de ${dataInicio.toISOString()} até ${dataFim.toISOString()}`,
    );

    // Chamar serviço de cálculo
    const resultado = await this.custosService.calcularCustos(id, dataInicio, dataFim);

    // Montar response DTO
    return this.montarResponseCustos(resultado, query, dataInicio, dataFim);
  }

  /**
   * Calcula range de datas com base no período solicitado
   */
  private calcularRangeDatas(query: CustosEnergiaQueryDto): {
    dataInicio: Date;
    dataFim: Date;
  } {
    const dataRef = query.data ? new Date(query.data) : new Date();

    if (query.periodo === PeriodoTipo.DIA) {
      // Dia completo: 00:00:00 até 23:59:59
      const dataInicio = new Date(dataRef);
      dataInicio.setHours(0, 0, 0, 0);

      const dataFim = new Date(dataRef);
      dataFim.setHours(23, 59, 59, 999);

      return { dataInicio, dataFim };
    } else {
      // Mês completo: primeiro dia 00:00:00 até último dia 23:59:59
      const dataInicio = new Date(dataRef.getFullYear(), dataRef.getMonth(), 1, 0, 0, 0, 0);
      const dataFim = new Date(
        dataRef.getFullYear(),
        dataRef.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );

      return { dataInicio, dataFim };
    }
  }

  /**
   * Monta o response DTO com os dados calculados
   */
  private montarResponseCustos(
    resultado: any,
    query: CustosEnergiaQueryDto,
    dataInicio: Date,
    dataFim: Date,
  ) {
    const { unidade, tarifas, agregacao, custos } = resultado;

    return {
      periodo: {
        tipo: query.periodo,
        data_inicio: dataInicio.toISOString(),
        data_fim: dataFim.toISOString(),
      },
      unidade: {
        id: unidade.id,
        nome: unidade.nome,
        grupo: unidade.grupo,
        subgrupo: unidade.subgrupo,
        irrigante: unidade.irrigante,
      },
      concessionaria: {
        id: unidade.concessionaria_id,
      },
      tarifas_aplicadas: this.montarTarifasAplicadas(unidade, tarifas),
      consumo: {
        energia_ponta_kwh: agregacao.energia_ponta_kwh,
        energia_fora_ponta_kwh: agregacao.energia_fora_ponta_kwh,
        energia_reservado_kwh: agregacao.energia_reservado_kwh,
        energia_irrigante_kwh: agregacao.energia_irrigante_kwh,
        energia_total_kwh: agregacao.energia_total_kwh,
        demanda_maxima_kw: agregacao.demanda_maxima_kw,
        demanda_contratada_kw: unidade.demanda_contratada,
      },
      custos: {
        custo_ponta: custos.custo_ponta,
        custo_fora_ponta: custos.custo_fora_ponta,
        custo_reservado: custos.custo_reservado,
        custo_irrigante: custos.custo_irrigante,
        custo_demanda: custos.custo_demanda,
        custo_total: custos.custo_total,
        custo_medio_kwh: custos.custo_medio_kwh,
      },
      irrigante: unidade.irrigante
        ? {
            energia_periodo_kwh: agregacao.energia_irrigante_kwh,
            economia_total: custos.economia_irrigante,
            percentual_desconto: 80,
            horario_inicio: '21:30',
            horario_fim: '06:00',
          }
        : undefined,
    };
  }

  /**
   * Monta array de tarifas aplicadas com base no grupo da unidade
   */
  private montarTarifasAplicadas(unidade: any, tarifas: any) {
    if (unidade.grupo === 'A') {
      return [
        {
          tipo_horario: 'PONTA',
          tarifa_tusd: tarifas.tusd_p,
          tarifa_te: tarifas.te_p,
          tarifa_total: tarifas.tusd_p + tarifas.te_p,
          horario_inicio: '17:00',
          horario_fim: '20:00',
          dias_aplicacao: 'Segunda a Sexta',
        },
        {
          tipo_horario: 'FORA_PONTA',
          tarifa_tusd: tarifas.tusd_fp,
          tarifa_te: tarifas.te_fp,
          tarifa_total: tarifas.tusd_fp + tarifas.te_fp,
          horario_inicio: null,
          horario_fim: null,
          dias_aplicacao: 'Todos',
        },
        {
          tipo_horario: 'RESERVADO',
          tarifa_tusd: tarifas.tusd_fp,
          tarifa_te: tarifas.te_fp,
          tarifa_total: tarifas.tusd_fp + tarifas.te_fp,
          horario_inicio: null,
          horario_fim: null,
          dias_aplicacao: 'Todos',
          observacao: 'Na tarifa Verde: HR = FP',
        },
        {
          tipo_horario: 'DEMANDA',
          tarifa_tusd: tarifas.tusd_d,
          tarifa_te: tarifas.te_d,
          tarifa_total: tarifas.tusd_d + (tarifas.te_d || 0),
        },
      ];
    } else {
      // Grupo B
      return [
        {
          tipo_horario: 'FORA_PONTA',
          tarifa_tusd: tarifas.tusd_b,
          tarifa_te: tarifas.te_b,
          tarifa_total: tarifas.tusd_b + tarifas.te_b,
          horario_inicio: null,
          horario_fim: null,
          dias_aplicacao: 'Todos',
        },
      ];
    }
  }
}
