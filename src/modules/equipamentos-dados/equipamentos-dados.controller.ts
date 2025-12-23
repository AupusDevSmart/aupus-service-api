import { Controller, Get, Param, Query, Logger, Post, Body } from '@nestjs/common';
import { EquipamentosDadosService } from './equipamentos-dados.service';
import { CalculoCustosService } from './services/calculo-custos.service';
import { EquipamentoDadosQueryDto } from './dto/equipamento-dados-query.dto';
import { CustosEnergiaQueryDto, PeriodoTipo } from './dto/custos-energia-query.dto';

@Controller('equipamentos-dados')
export class EquipamentosDadosController {
  private readonly logger = new Logger(EquipamentosDadosController.name);
  // Controller de dados de equipamentos com endpoint de custos de energia

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

  // Endpoints de múltiplos equipamentos removidos
  // A agregação é feita no frontend usando os endpoints individuais

  /**
   * GET /equipamentos-dados/:id/custos-energia
   * Retorna cálculo de custos de energia para um equipamento M160
   *
   * ✅ ATUALIZADO: Suporta 3 modos de filtro:
   * 1. periodo=dia&data=YYYY-MM-DD (dia completo)
   * 2. periodo=mes&data=YYYY-MM (mês completo)
   * 3. periodo=custom&timestamp_inicio=ISO8601&timestamp_fim=ISO8601 (range customizado)
   */
  @Get(':id/custos-energia')
  async getCustosEnergia(
    @Param('id') id: string,
    @Query() query: CustosEnergiaQueryDto,
  ) {
    this.logger.log(
      `GET /equipamentos-dados/${id}/custos-energia?periodo=${query.periodo || 'custom'}&data=${query.data || ''}&timestamp_inicio=${query.timestamp_inicio || ''}&timestamp_fim=${query.timestamp_fim || ''}`,
    );

    // Determinar range de datas com base no período
    const { dataInicio, dataFim } = this.calcularRangeDatas(query);

    this.logger.log(
      `📊 [CUSTOS] Calculando custos para equipamento ${id} de ${dataInicio.toISOString()} até ${dataFim.toISOString()}`,
    );

    // Chamar serviço de cálculo (✅ passar tipo de período)
    const resultado = await this.custosService.calcularCustos(id, dataInicio, dataFim, query.periodo);

    // Montar response DTO
    return this.montarResponseCustos(resultado, query, dataInicio, dataFim);
  }

  /**
   * Calcula range de datas com base no período solicitado
   * ✅ ATUALIZADO: Suporta período customizado com timestamps
   */
  private calcularRangeDatas(query: CustosEnergiaQueryDto): {
    dataInicio: Date;
    dataFim: Date;
  } {
    // MODO 1: Período customizado com timestamps
    if (query.periodo === PeriodoTipo.CUSTOM || (query.timestamp_inicio && query.timestamp_fim)) {
      if (!query.timestamp_inicio || !query.timestamp_fim) {
        throw new Error(
          'Para período customizado, timestamp_inicio e timestamp_fim são obrigatórios',
        );
      }

      const dataInicio = new Date(query.timestamp_inicio);
      const dataFim = new Date(query.timestamp_fim);

      // Validar que início é antes do fim
      if (dataInicio >= dataFim) {
        throw new Error('timestamp_inicio deve ser anterior a timestamp_fim');
      }

      // Validar que não é um período muito longo (máximo 1 ano)
      const diffDias = (dataFim.getTime() - dataInicio.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDias > 366) {
        throw new Error('Período máximo permitido: 1 ano (366 dias)');
      }

      return { dataInicio, dataFim };
    }

    // MODO 2 e 3: Dia ou Mês com data de referência
    const dataRef = query.data ? new Date(query.data) : new Date();

    if (query.periodo === PeriodoTipo.DIA) {
      // Dia completo: 00:00:00 até 23:59:59
      const dataInicio = new Date(dataRef);
      dataInicio.setHours(0, 0, 0, 0);

      const dataFim = new Date(dataRef);
      dataFim.setHours(23, 59, 59, 999);

      return { dataInicio, dataFim };
    } else if (query.periodo === PeriodoTipo.MES) {
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

    // Default: mês atual (backward compatibility)
    const dataInicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 0, 0, 0, 0);
    const dataFim = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    return { dataInicio, dataFim };
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
          horario_inicio: '18:00', // ✅ ATUALIZADO de 17:00 para 18:00
          horario_fim: '21:00',    // ✅ ATUALIZADO de 20:00 para 21:00
          dias_aplicacao: 'Todos', // ✅ ATUALIZADO: ponta agora é todos os dias
        },
        {
          tipo_horario: 'FORA_PONTA',
          tarifa_tusd: tarifas.tusd_fp,
          tarifa_te: tarifas.te_fp,
          tarifa_total: tarifas.tusd_fp + tarifas.te_fp,
          horario_inicio: '06:00', // ✅ ATUALIZADO: FP tem 2 períodos: 06:00-18:00 e 21:00-21:30
          horario_fim: '18:00',
          dias_aplicacao: 'Todos',
        },
        {
          tipo_horario: 'RESERVADO',
          tarifa_tusd: tarifas.tusd_fp,
          tarifa_te: tarifas.te_fp,
          tarifa_total: tarifas.tusd_fp + tarifas.te_fp,
          horario_inicio: '21:30', // ✅ ATUALIZADO: HR inicia às 21:30
          horario_fim: '06:00',
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
