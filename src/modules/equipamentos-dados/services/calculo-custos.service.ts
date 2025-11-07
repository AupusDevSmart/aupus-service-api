import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ClassificacaoHorariosService } from './classificacao-horarios.service';
import {
  TipoHorario,
  DadosUnidade,
  TarifasConcessionaria,
  LeituraMQTT,
  AgregacaoEnergia,
  CalculoCustos,
} from '../interfaces/calculo-custos.interface';

/**
 * Serviço principal de cálculo de custos de energia
 *
 * Responsável por:
 * 1. Buscar leituras MQTT do período
 * 2. Classificar cada leitura por tipo de horário
 * 3. Agregar energia por categoria (P, FP, HR, Irrigante)
 * 4. Calcular custos totais
 */
@Injectable()
export class CalculoCustosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classificacaoService: ClassificacaoHorariosService,
  ) {}

  /**
   * Calcula custos de energia para um equipamento em um período
   */
  async calcularCustos(
    equipamentoId: string,
    dataInicio: Date,
    dataFim: Date,
  ): Promise<{
    unidade: DadosUnidade;
    tarifas: TarifasConcessionaria;
    agregacao: AgregacaoEnergia;
    custos: CalculoCustos;
  }> {
    // 1. Buscar dados da unidade e tarifas
    const { unidade, tarifas } = await this.buscarDadosUnidadeETarifas(equipamentoId);

    // 2. Buscar leituras MQTT do período
    const leituras = await this.buscarLeiturasPeriodo(equipamentoId, dataInicio, dataFim);

    // 3. Agregar energia por tipo de horário
    const agregacao = this.agregarEnergiaPorTipo(leituras, unidade, tarifas);

    // 4. Calcular custos
    const custos = this.calcularCustosPorCategoria(agregacao, unidade, tarifas);

    return {
      unidade,
      tarifas,
      agregacao,
      custos,
    };
  }

  /**
   * Busca dados da unidade e tarifas da concessionária
   */
  private async buscarDadosUnidadeETarifas(
    equipamentoId: string,
  ): Promise<{ unidade: DadosUnidade; tarifas: TarifasConcessionaria }> {
    // Buscar equipamento com unidade e concessionária
    const equipamento = await this.prisma.equipamentos.findUnique({
      where: { id: equipamentoId },
      include: {
        unidade: {
          include: {
            concessionaria: true,
          },
        },
      },
    });

    if (!equipamento || !equipamento.unidade) {
      throw new Error('Equipamento ou unidade não encontrado');
    }

    const unidadeDb = equipamento.unidade;
    const concessionariaDb = unidadeDb.concessionaria;

    if (!concessionariaDb) {
      throw new Error('Concessionária não encontrada para esta unidade');
    }

    // Montar dados da unidade
    const unidade: DadosUnidade = {
      id: unidadeDb.id,
      nome: unidadeDb.nome,
      grupo: unidadeDb.grupo || 'B', // Default para Grupo B se não especificado
      subgrupo: unidadeDb.subgrupo || '',
      irrigante: unidadeDb.irrigante,
      demanda_contratada: unidadeDb.demanda_carga
        ? parseFloat(unidadeDb.demanda_carga.toString())
        : undefined,
      concessionaria_id: concessionariaDb.id,
    };

    // Montar tarifas com base no grupo e subgrupo
    const tarifas: TarifasConcessionaria = this.montarTarifas(unidade, concessionariaDb);

    return { unidade, tarifas };
  }

  /**
   * Monta objeto de tarifas com base no grupo/subgrupo da unidade
   */
  private montarTarifas(unidade: DadosUnidade, concessionaria: any): TarifasConcessionaria {
    if (unidade.grupo === 'A') {
      // Determinar qual conjunto de tarifas usar (A3a ou A4)
      const prefixo = unidade.subgrupo.toLowerCase().replace(/[^a-z0-9]/g, ''); // a3a, a4, etc

      if (prefixo === 'a3a') {
        return {
          tusd_p: this.parseDecimal(concessionaria.a3a_verde_tusd_p),
          te_p: this.parseDecimal(concessionaria.a3a_verde_te_p),
          tusd_fp: this.parseDecimal(concessionaria.a3a_verde_tusd_fp),
          te_fp: this.parseDecimal(concessionaria.a3a_verde_te_fp),
          tusd_d: this.parseDecimal(concessionaria.a3a_verde_tusd_d),
          te_d: this.parseDecimal(concessionaria.a3a_verde_te_d),
        };
      } else if (prefixo === 'a4') {
        return {
          tusd_p: this.parseDecimal(concessionaria.a4_verde_tusd_p),
          te_p: this.parseDecimal(concessionaria.a4_verde_te_p),
          tusd_fp: this.parseDecimal(concessionaria.a4_verde_tusd_fp),
          te_fp: this.parseDecimal(concessionaria.a4_verde_te_fp),
          tusd_d: this.parseDecimal(concessionaria.a4_verde_tusd_d),
          te_d: this.parseDecimal(concessionaria.a4_verde_te_d),
        };
      }
    }

    // Grupo B (padrão)
    return {
      tusd_b: this.parseDecimal(concessionaria.b_tusd_valor),
      te_b: this.parseDecimal(concessionaria.b_te_valor),
    };
  }

  /**
   * Converte Decimal do Prisma para number
   */
  private parseDecimal(value: any): number {
    if (value === null || value === undefined) return 0;
    return parseFloat(value.toString());
  }

  /**
   * Busca leituras MQTT do período
   */
  private async buscarLeiturasPeriodo(
    equipamentoId: string,
    dataInicio: Date,
    dataFim: Date,
  ): Promise<LeituraMQTT[]> {
    const dados = await this.prisma.equipamentos_dados.findMany({
      where: {
        equipamento_id: equipamentoId,
        timestamp_dados: {
          gte: dataInicio,
          lte: dataFim,
        },
        // Apenas dados agregados (1 minuto)
        num_leituras: {
          not: null,
        },
      },
      orderBy: {
        timestamp_dados: 'asc',
      },
      select: {
        timestamp_dados: true,
        dados: true,
      },
    });

    return dados.map((d) => {
      const dadosJson = d.dados as any;

      // Suportar tanto estrutura nova quanto legada
      const energia_kwh = dadosJson.energy?.period_energy_kwh || dadosJson.energia_kwh || 0;
      const potencia_kw = dadosJson.power?.active_total
        ? dadosJson.power.active_total / 1000 // Converter W para kW
        : dadosJson.power_avg || 0;

      return {
        timestamp: d.timestamp_dados,
        energia_kwh: typeof energia_kwh === 'number' ? energia_kwh : parseFloat(energia_kwh),
        potencia_kw: typeof potencia_kw === 'number' ? potencia_kw : parseFloat(potencia_kw),
      };
    });
  }

  /**
   * Agrega energia por tipo de horário
   */
  private agregarEnergiaPorTipo(
    leituras: LeituraMQTT[],
    unidade: DadosUnidade,
    tarifas: TarifasConcessionaria,
  ): AgregacaoEnergia {
    const agregacao: AgregacaoEnergia = {
      energia_ponta_kwh: 0,
      energia_fora_ponta_kwh: 0,
      energia_reservado_kwh: 0,
      energia_irrigante_kwh: 0,
      energia_total_kwh: 0,
      demanda_maxima_kw: 0,
      num_leituras: leituras.length,
    };

    for (const leitura of leituras) {
      // Classificar horário
      const classificacao = this.classificacaoService.classificar(
        leitura.timestamp,
        unidade,
        tarifas,
      );

      // Agregar energia por tipo
      switch (classificacao.tipo) {
        case TipoHorario.PONTA:
          agregacao.energia_ponta_kwh += leitura.energia_kwh;
          break;
        case TipoHorario.FORA_PONTA:
          agregacao.energia_fora_ponta_kwh += leitura.energia_kwh;
          break;
        case TipoHorario.RESERVADO:
          agregacao.energia_reservado_kwh += leitura.energia_kwh;
          break;
        case TipoHorario.IRRIGANTE:
          agregacao.energia_irrigante_kwh += leitura.energia_kwh;
          break;
      }

      // Atualizar demanda máxima
      if (leitura.potencia_kw > agregacao.demanda_maxima_kw) {
        agregacao.demanda_maxima_kw = leitura.potencia_kw;
      }

      // Acumular total
      agregacao.energia_total_kwh += leitura.energia_kwh;
    }

    return agregacao;
  }

  /**
   * Calcula custos por categoria
   */
  private calcularCustosPorCategoria(
    agregacao: AgregacaoEnergia,
    unidade: DadosUnidade,
    tarifas: TarifasConcessionaria,
  ): CalculoCustos {
    const custos: CalculoCustos = {
      custo_ponta: 0,
      custo_fora_ponta: 0,
      custo_reservado: 0,
      custo_irrigante: 0,
      custo_demanda: 0,
      custo_total: 0,
      custo_medio_kwh: 0,
      economia_irrigante: 0,
    };

    if (unidade.grupo === 'A') {
      // Ponta
      const tarifa_ponta = (tarifas.tusd_p || 0) + (tarifas.te_p || 0);
      custos.custo_ponta = agregacao.energia_ponta_kwh * tarifa_ponta;

      // Fora Ponta
      const tarifa_fp = (tarifas.tusd_fp || 0) + (tarifas.te_fp || 0);
      custos.custo_fora_ponta = agregacao.energia_fora_ponta_kwh * tarifa_fp;

      // Reservado (= FP na Verde)
      custos.custo_reservado = agregacao.energia_reservado_kwh * tarifa_fp;

      // Irrigante (com 80% desconto na TE)
      if (agregacao.energia_irrigante_kwh > 0) {
        const tusd = tarifas.tusd_fp || 0;
        const te_original = tarifas.te_fp || 0;
        const te_com_desconto = te_original * 0.20; // 80% desconto
        const tarifa_irrigante = tusd + te_com_desconto;

        custos.custo_irrigante = agregacao.energia_irrigante_kwh * tarifa_irrigante;

        // Calcular economia
        const custo_sem_desconto = agregacao.energia_irrigante_kwh * tarifa_fp;
        custos.economia_irrigante = custo_sem_desconto - custos.custo_irrigante;
      }

      // Demanda
      if (unidade.demanda_contratada && tarifas.tusd_d) {
        custos.custo_demanda = unidade.demanda_contratada * tarifas.tusd_d;
      }
    } else {
      // Grupo B (tarifa única)
      const tarifa_b = (tarifas.tusd_b || 0) + (tarifas.te_b || 0);

      // Consumo normal
      const energia_normal =
        agregacao.energia_total_kwh - agregacao.energia_irrigante_kwh;
      custos.custo_fora_ponta = energia_normal * tarifa_b;

      // Irrigante (se aplicável)
      if (agregacao.energia_irrigante_kwh > 0) {
        const tusd = tarifas.tusd_b || 0;
        const te_original = tarifas.te_b || 0;
        const te_com_desconto = te_original * 0.20; // 80% desconto
        const tarifa_irrigante = tusd + te_com_desconto;

        custos.custo_irrigante = agregacao.energia_irrigante_kwh * tarifa_irrigante;

        // Calcular economia
        const custo_sem_desconto = agregacao.energia_irrigante_kwh * tarifa_b;
        custos.economia_irrigante = custo_sem_desconto - custos.custo_irrigante;
      }
    }

    // Total
    custos.custo_total =
      custos.custo_ponta +
      custos.custo_fora_ponta +
      custos.custo_reservado +
      custos.custo_irrigante +
      custos.custo_demanda;

    // Custo médio por kWh
    if (agregacao.energia_total_kwh > 0) {
      custos.custo_medio_kwh = custos.custo_total / agregacao.energia_total_kwh;
    }

    return custos;
  }
}
