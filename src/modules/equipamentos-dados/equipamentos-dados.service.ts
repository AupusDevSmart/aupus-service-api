import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { EquipamentoDadosQueryDto } from './dto/equipamento-dados-query.dto';

@Injectable()
export class EquipamentosDadosService {
  private readonly logger = new Logger(EquipamentosDadosService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Buscar o dado mais recente de um equipamento
   */
  async findLatest(equipamentoId: string) {
    this.logger.log(`Buscando dado mais recente para equipamento ${equipamentoId}`);

    // Limpar espaços do ID (problema de CHAR vs VARCHAR)
    const equipamentoIdLimpo = equipamentoId.trim();

    // Verificar se o equipamento existe
    const equipamento = await this.prisma.equipamentos.findUnique({
      where: { id: equipamentoIdLimpo },
      include: {
        tipo_equipamento_rel: true,
      },
    });

    if (!equipamento) {
      throw new NotFoundException(`Equipamento ${equipamentoId} não encontrado`);
    }

    // Buscar o dado mais recente
    // Como equipamento_id no banco pode ter espaços, usar o ID do equipamento encontrado
    const dado = await this.prisma.equipamentos_dados.findFirst({
      where: { equipamento_id: equipamento.id },
      orderBy: { timestamp_dados: 'desc' },
    });

    if (!dado) {
      return {
        equipamento: {
          id: equipamento.id,
          nome: equipamento.nome,
          tipo: equipamento.tipo_equipamento_rel?.nome,
        },
        dado: null,
        message: 'Nenhum dado MQTT disponível para este equipamento',
      };
    }

    return {
      equipamento: {
        id: equipamento.id,
        nome: equipamento.nome,
        tipo: equipamento.tipo_equipamento_rel?.nome,
        mqtt_habilitado: equipamento.mqtt_habilitado,
        topico_mqtt: equipamento.topico_mqtt,
      },
      dado: {
        id: dado.id,
        dados: dado.dados,
        fonte: dado.fonte,
        timestamp_dados: dado.timestamp_dados,
        qualidade: dado.qualidade,
        created_at: dado.created_at,
      },
    };
  }

  /**
   * Buscar histórico de dados de um equipamento
   */
  async findHistory(equipamentoId: string, query: EquipamentoDadosQueryDto) {
    this.logger.log(`Buscando histórico para equipamento ${equipamentoId}`);

    // Limpar espaços do ID (problema de CHAR vs VARCHAR)
    const equipamentoIdLimpo = equipamentoId.trim();

    // Verificar se o equipamento existe
    const equipamento = await this.prisma.equipamentos.findUnique({
      where: { id: equipamentoIdLimpo },
    });

    if (!equipamento) {
      throw new NotFoundException(`Equipamento ${equipamentoId} não encontrado`);
    }

    const { page = 1, limit = 100, startDate, endDate, fonte, qualidade } = query;
    const skip = (page - 1) * limit;

    // Construir filtros (usar o ID do equipamento encontrado com espaços)
    const where: any = {
      equipamento_id: equipamento.id,
    };

    if (startDate || endDate) {
      where.timestamp_dados = {};
      if (startDate) where.timestamp_dados.gte = new Date(startDate);
      if (endDate) where.timestamp_dados.lte = new Date(endDate);
    }

    if (fonte) where.fonte = fonte;
    if (qualidade) where.qualidade = qualidade;

    // Buscar dados com paginação
    const [dados, total] = await Promise.all([
      this.prisma.equipamentos_dados.findMany({
        where,
        orderBy: { timestamp_dados: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.equipamentos_dados.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: dados.map((d) => ({
        id: d.id,
        dados: d.dados,
        fonte: d.fonte,
        timestamp_dados: d.timestamp_dados,
        qualidade: d.qualidade,
        created_at: d.created_at,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Salvar novo dado MQTT para um equipamento
   */
  async create(equipamentoId: string, dados: any, fonte: string = 'MQTT', qualidade: string = 'GOOD') {
    this.logger.log(`Salvando dados MQTT para equipamento ${equipamentoId}`);

    return this.prisma.equipamentos_dados.create({
      data: {
        equipamento_id: equipamentoId,
        dados,
        fonte,
        qualidade,
        timestamp_dados: new Date(),
      },
    });
  }

  /**
   * Buscar estatísticas de dados de um equipamento
   */
  async getStats(equipamentoId: string) {
    this.logger.log(`Buscando estatísticas para equipamento ${equipamentoId}`);

    const stats = await this.prisma.equipamentos_dados.aggregate({
      where: { equipamento_id: equipamentoId },
      _count: true,
    });

    const oldest = await this.prisma.equipamentos_dados.findFirst({
      where: { equipamento_id: equipamentoId },
      orderBy: { timestamp_dados: 'asc' },
      select: { timestamp_dados: true },
    });

    const newest = await this.prisma.equipamentos_dados.findFirst({
      where: { equipamento_id: equipamentoId },
      orderBy: { timestamp_dados: 'desc' },
      select: { timestamp_dados: true },
    });

    return {
      total_records: stats._count,
      oldest_record: oldest?.timestamp_dados,
      newest_record: newest?.timestamp_dados,
    };
  }

  /**
   * Gráfico do Dia - Curva de potência ao longo do dia
   * Retorna dados agregados de 1 minuto para o dia especificado
   */
  async getGraficoDia(equipamentoId: string, data?: string) {
    // console.log(`\n📊 [GRÁFICO DIA] ========================================`);
    // console.log(`📊 [GRÁFICO DIA] Equipamento: ${equipamentoId}`);
    // console.log(`📊 [GRÁFICO DIA] Data solicitada: ${data || 'hoje'}`);

    // Verificar o tipo do equipamento
    const equipamento = await this.prisma.equipamentos.findUnique({
      where: { id: equipamentoId },
      include: { tipo_equipamento_rel: true }
    });

    if (!equipamento) {
      throw new NotFoundException(`Equipamento ${equipamentoId} não encontrado`);
    }

    // Definir a data (hoje se não especificada)
    const dataConsulta = data ? new Date(data) : new Date();
    dataConsulta.setHours(0, 0, 0, 0);

    const dataFim = new Date(dataConsulta);
    dataFim.setDate(dataFim.getDate() + 1);

    // console.log(`📊 [GRÁFICO DIA] Período de busca:`);
    // console.log(`📊 [GRÁFICO DIA]   De: ${dataConsulta.toISOString()}`);
    // console.log(`📊 [GRÁFICO DIA]   Até: ${dataFim.toISOString()}`);
    // console.log(`📊 [GRÁFICO DIA] Tipo do equipamento: ${equipamento.tipo_equipamento_rel?.codigo}`);

    // Buscar dados da tabela equipamentos_dados para TODOS os tipos de equipamento
    const dados = await this.prisma.equipamentos_dados.findMany({
      where: {
        equipamento_id: equipamentoId,
        timestamp_dados: {
          gte: dataConsulta,
          lt: dataFim,
        },
      },
      orderBy: { timestamp_dados: 'asc' },
      select: {
        timestamp_dados: true,
        dados: true,
        num_leituras: true,
        qualidade: true,
      },
    });

    // console.log(`📊 [GRÁFICO DIA] Registros encontrados: ${dados.length}`);
    //
    // if (dados.length > 0) {
    //   console.log(`📊 [GRÁFICO DIA] Amostra do primeiro registro:`);
    //   console.log(`📊 [GRÁFICO DIA]   Timestamp: ${dados[0].timestamp_dados}`);
    //   console.log(`📊 [GRÁFICO DIA]   Num leituras: ${dados[0].num_leituras}`);
    //   console.log(`📊 [GRÁFICO DIA]   Estrutura completa do dados:`, JSON.stringify(dados[0].dados, null, 2));
    //
    //   // Verificar especificamente para inversores
    //   const dadosObj = dados[0].dados as any;
    //   if (dadosObj.power) {
    //     console.log(`📊 [GRÁFICO DIA]   power.active_total: ${dadosObj.power.active_total}`);
    //   }
    //   if (dadosObj.dc) {
    //     console.log(`📊 [GRÁFICO DIA]   dc.total_power: ${dadosObj.dc.total_power}`);
    //   }
    // }

    // Agrupar dados em intervalos de 5 minutos para reduzir variação
    const INTERVALO_MINUTOS = 5;
    const dadosAgrupados = new Map<string, {
      timestamp: Date;
      dados: any[];
      potencias: number[];
      dadosM160: any[]; // Para preservar dados M160 (tensão, FP, etc)
    }>();

    dados.forEach((d: any) => {
      // Arredondar para o intervalo de 5 minutos
      const minuto = new Date(d.timestamp_dados);
      const minutosArredondados = Math.floor(minuto.getMinutes() / INTERVALO_MINUTOS) * INTERVALO_MINUTOS;
      minuto.setMinutes(minutosArredondados, 0, 0);
      const minutoKey = minuto.toISOString();

      if (!dadosAgrupados.has(minutoKey)) {
        dadosAgrupados.set(minutoKey, {
          timestamp: minuto,
          dados: [],
          potencias: [],
          dadosM160: [],
        });
      }

      const grupo = dadosAgrupados.get(minutoKey)!;
      grupo.dados.push(d);

      // Extrair potência
      let potenciaKw = 0;
      if (d.dados.potencia_kw !== undefined) {
        potenciaKw = d.dados.potencia_kw;
      } else if (d.dados.power?.active_total !== undefined) {
        potenciaKw = d.dados.power.active_total / 1000;
      } else if (d.dados.dc?.total_power !== undefined) {
        potenciaKw = d.dados.dc.total_power / 1000;
      } else if (d.dados.power?.active !== undefined) {
        potenciaKw = d.dados.power.active / 1000;
      } else if (d.dados.power_avg !== undefined) {
        potenciaKw = d.dados.power_avg;
      } else if (d.dados.potencia_ativa_kw !== undefined) {
        potenciaKw = d.dados.potencia_ativa_kw;
      } else if (d.dados.active_power !== undefined) {
        potenciaKw = d.dados.active_power / 1000;
      } else if (d.dados.Dados) {
        const Pa = d.dados.Dados.Pa || 0;
        const Pb = d.dados.Dados.Pb || 0;
        const Pc = d.dados.Dados.Pc || 0;
        potenciaKw = (Pa + Pb + Pc) / 1000;
      }

      grupo.potencias.push(potenciaKw);

      // Se houver dados M160, armazenar para agregação
      if (d.dados.Dados) {
        grupo.dadosM160.push(d.dados.Dados);
      }
    });

    // Converter para array e calcular médias por intervalo
    const pontosAgrupados = Array.from(dadosAgrupados.values()).map((grupo) => {
      // Calcular média da potência no intervalo de 5 minutos
      const potenciaMedia = grupo.potencias.length > 0
        ? grupo.potencias.reduce((sum, p) => sum + p, 0) / grupo.potencias.length
        : 0;

      const potenciaMin = grupo.potencias.length > 0 ? Math.min(...grupo.potencias) : 0;
      const potenciaMax = grupo.potencias.length > 0 ? Math.max(...grupo.potencias) : 0;

      const ponto: any = {
        timestamp: grupo.timestamp,
        hora: grupo.timestamp.toISOString(),
        potencia_kw: potenciaMedia,
        potencia_min: potenciaMin,
        potencia_max: potenciaMax,
        num_leituras: grupo.dados.length,
        qualidade: 'GOOD',
      };

      // Se houver dados M160, calcular média dos campos
      if (grupo.dadosM160.length > 0) {
        const avgM160 = {
          Va: grupo.dadosM160.reduce((sum, d) => sum + (d.Va || 0), 0) / grupo.dadosM160.length,
          Vb: grupo.dadosM160.reduce((sum, d) => sum + (d.Vb || 0), 0) / grupo.dadosM160.length,
          Vc: grupo.dadosM160.reduce((sum, d) => sum + (d.Vc || 0), 0) / grupo.dadosM160.length,
          Ia: grupo.dadosM160.reduce((sum, d) => sum + (d.Ia || 0), 0) / grupo.dadosM160.length,
          Ib: grupo.dadosM160.reduce((sum, d) => sum + (d.Ib || 0), 0) / grupo.dadosM160.length,
          Ic: grupo.dadosM160.reduce((sum, d) => sum + (d.Ic || 0), 0) / grupo.dadosM160.length,
          Pa: grupo.dadosM160.reduce((sum, d) => sum + (d.Pa || 0), 0) / grupo.dadosM160.length,
          Pb: grupo.dadosM160.reduce((sum, d) => sum + (d.Pb || 0), 0) / grupo.dadosM160.length,
          Pc: grupo.dadosM160.reduce((sum, d) => sum + (d.Pc || 0), 0) / grupo.dadosM160.length,
          FPA: grupo.dadosM160.reduce((sum, d) => sum + (d.FPA || 0), 0) / grupo.dadosM160.length,
          FPB: grupo.dadosM160.reduce((sum, d) => sum + (d.FPB || 0), 0) / grupo.dadosM160.length,
          FPC: grupo.dadosM160.reduce((sum, d) => sum + (d.FPC || 0), 0) / grupo.dadosM160.length,
          freq: grupo.dadosM160.reduce((sum, d) => sum + (d.freq || 0), 0) / grupo.dadosM160.length,
        };
        ponto.Dados = avgM160;
      }

      return ponto;
    }).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // console.log(`📊 [GRÁFICO DIA] Total de pontos processados: ${pontosAgrupados.length}`);

    // Aplicar suavização com média móvel para reduzir ruído
    const JANELA_SUAVIZACAO = 3;
    const pontos = pontosAgrupados.map((ponto, indice) => {
      const inicio = Math.max(0, indice - Math.floor(JANELA_SUAVIZACAO / 2));
      const fim = Math.min(pontosAgrupados.length, indice + Math.floor(JANELA_SUAVIZACAO / 2) + 1);
      const pontosNaJanela = pontosAgrupados.slice(inicio, fim);

      const potenciaMedia = pontosNaJanela.reduce((sum, p) => sum + p.potencia_kw, 0) / pontosNaJanela.length;

      return {
        ...ponto,
        potencia_kw: potenciaMedia,
      };
    });

    // console.log(`📊 [GRÁFICO DIA] Total de pontos após suavização (janela ${JANELA_SUAVIZACAO}): ${pontos.length}`);
    // if (pontos.length > 0) {
    //   console.log(`📊 [GRÁFICO DIA] Primeiro ponto:`, pontos[0]);
    // }

    // SE NÃO HOUVER DADOS E FOR INVERSOR, GERAR DADOS SIMULADOS
    if (pontos.length === 0 && equipamento.tipo_equipamento_rel?.codigo === 'INVERSOR') {
      // console.log(`⚠️ [GRÁFICO DIA] Sem dados reais para ${equipamento.nome}, gerando dados simulados...`);

      // Gerar curva típica de geração solar
      const horaInicio = 6; // 6:00
      const horaFim = 18; // 18:00
      const picoHora = 12; // Meio-dia
      const potenciaPico = 5000; // 5kW pico

      for (let hora = horaInicio; hora <= horaFim; hora++) {
        for (let minuto = 0; minuto < 60; minuto += 5) { // Dados a cada 5 minutos
          const timestamp = new Date(dataConsulta);
          timestamp.setHours(hora, minuto, 0, 0);

          // Calcular potência baseado em curva gaussiana
          const horaDecimal = hora + minuto / 60;
          const distanciaPico = Math.abs(horaDecimal - picoHora);
          const fatorGaussiano = Math.exp(-Math.pow(distanciaPico / 3, 2));

          // Adicionar variação aleatória (±10%)
          const variacao = 1 + (Math.random() - 0.5) * 0.2;
          const potencia = potenciaPico * fatorGaussiano * variacao;

          pontos.push({
            timestamp: timestamp,
            hora: timestamp.toISOString(),
            potencia_kw: potencia / 1000, // Converter para kW
            potencia_min: potencia * 0.95 / 1000,
            potencia_max: potencia * 1.05 / 1000,
            num_leituras: 1,
            qualidade: 'SIMULATED',
          });
        }
      }

      // console.log(`✅ [GRÁFICO DIA] Gerados ${pontos.length} pontos simulados`);
    }

    // console.log(`📊 [GRÁFICO DIA] ========================================\n`);

    return {
      data: dataConsulta.toISOString().split('T')[0],
      total_pontos: pontos.length,
      dados: pontos,
    };
  }

  /**
   * Gráfico do Mês - Energia gerada por dia
   * Soma a energia de todos os minutos de cada dia
   */
  async getGraficoMes(equipamentoId: string, mes?: string) {
    console.log(`\n📊 [GRÁFICO MÊS] ========================================`);
    console.log(`📊 [GRÁFICO MÊS] Equipamento: ${equipamentoId}`);
    console.log(`📊 [GRÁFICO MÊS] Mês solicitado: ${mes || 'atual'}`);

    // Verificar o tipo do equipamento
    const equipamento = await this.prisma.equipamentos.findUnique({
      where: { id: equipamentoId },
      include: { tipo_equipamento_rel: true }
    });

    if (!equipamento) {
      throw new NotFoundException(`Equipamento ${equipamentoId} não encontrado`);
    }

    // Definir o mês (atual se não especificado)
    const now = new Date();
    const ano = mes ? parseInt(mes.split('-')[0]) : now.getFullYear();
    const mesNum = mes ? parseInt(mes.split('-')[1]) : now.getMonth() + 1;

    const dataInicio = new Date(ano, mesNum - 1, 1);
    const dataFim = new Date(ano, mesNum, 1);

    console.log(`📊 [GRÁFICO MÊS] Período de busca:`);
    console.log(`📊 [GRÁFICO MÊS]   De: ${dataInicio.toISOString()}`);
    console.log(`📊 [GRÁFICO MÊS]   Até: ${dataFim.toISOString()}`);
    console.log(`📊 [GRÁFICO MÊS] Tipo do equipamento: ${equipamento.tipo_equipamento_rel?.codigo}`);

    let dados: any[] = [];

    // Se for INVERSOR, buscar da tabela inversor_leituras
    if (equipamento.tipo_equipamento_rel?.codigo === 'INVERSOR') {
      console.log(`📊 [GRÁFICO MÊS] Buscando dados de INVERSOR na tabela inversor_leituras`);

      // Mapear o ID do equipamento para o ID do inversor
      const inversorMap: Record<string, number> = {
        'cmhcfyoj30003jqo8bhhaexlp': 3, // Inversor 3
        'cmhdd6wkv001kjqo8rl39taa6': 2, // Inversor 2
        'cmhddtv0h0024jqo8h4dzm4gq': 1, // Inversor 1
      };

      const inversorId = inversorMap[equipamentoId.trim()];

      if (inversorId) {
        dados = await this.prisma.$queryRaw<Array<any>>`
          SELECT
            DATE(timestamp) as data,
            -- Calcular energia assumindo que cada leitura representa consumo constante no período
            SUM(active_power::numeric / 1000.0 / 60.0) as energia_kwh,
            COUNT(*) as num_registros,
            AVG(active_power::numeric / 1000.0) as potencia_media_kw,
            MAX(active_power::numeric / 1000.0) as potencia_max_kw
          FROM inversor_leituras
          WHERE inversor_id = ${inversorId}
            AND timestamp >= ${dataInicio}
            AND timestamp < ${dataFim}
          GROUP BY DATE(timestamp)
          ORDER BY data ASC
        `;
      }
    } else {
      // Para outros equipamentos, usar a query original
      dados = await this.prisma.$queryRaw<Array<any>>`
        SELECT
          DATE(timestamp_dados) as data,
          SUM(
            COALESCE(
              (dados->'energy'->>'period_energy_kwh')::numeric,
              (dados->>'energia_kwh')::numeric
            )
          ) as energia_kwh,
          COUNT(*) as num_registros,
          AVG(
            COALESCE(
              (dados->'power'->>'active_total')::numeric / 1000.0,
              (dados->>'power_avg')::numeric
            )
          ) as potencia_media_kw
        FROM equipamentos_dados
        WHERE equipamento_id = ${equipamentoId}
          AND timestamp_dados >= ${dataInicio}
          AND timestamp_dados < ${dataFim}
          AND num_leituras IS NOT NULL
          AND (
            dados->'energy'->>'period_energy_kwh' IS NOT NULL
            OR dados->>'energia_kwh' IS NOT NULL
          )
        GROUP BY DATE(timestamp_dados)
        ORDER BY data ASC
      `;
    }

    console.log(`📊 [GRÁFICO MÊS] Dias com dados: ${dados.length}`);
    if (dados.length > 0) {
      console.log(`📊 [GRÁFICO MÊS] Primeiro dia:`, {
        data: dados[0].data,
        energia_kwh: dados[0].energia_kwh,
        num_registros: dados[0].num_registros,
        potencia_media_kw: dados[0].potencia_media_kw,
      });
    }

    // Transformar para formato do gráfico
    const pontos = dados.map((d: any) => ({
      data: d.data.toISOString().split('T')[0],
      dia: d.data.getDate(),
      energia_kwh: parseFloat(d.energia_kwh) || 0,
      potencia_media_kw: parseFloat(d.potencia_media_kw) || 0,
      num_registros: parseInt(d.num_registros),
    }));

    const energiaTotal = pontos.reduce((sum, p) => sum + p.energia_kwh, 0);

    console.log(`📊 [GRÁFICO MÊS] Total de pontos: ${pontos.length}`);
    console.log(`📊 [GRÁFICO MÊS] Energia total: ${energiaTotal} kWh`);
    console.log(`📊 [GRÁFICO MÊS] ========================================\n`);

    return {
      mes: `${ano}-${String(mesNum).padStart(2, '0')}`,
      total_dias: pontos.length,
      energia_total_kwh: energiaTotal,
      dados: pontos,
    };
  }

  /**
   * Gráfico do Dia para Múltiplos Equipamentos - Soma das potências
   * Agrega dados de múltiplos equipamentos selecionados (usando equipamentos_dados)
   */
  async getGraficoDiaMultiplosInversores(equipamentosIds: string[], data?: string) {
    console.log(`\n📊 [GRÁFICO DIA MÚLTIPLO] ========================================`);
    console.log(`📊 [GRÁFICO DIA MÚLTIPLO] Equipamentos: ${equipamentosIds.join(', ')}`);
    console.log(`📊 [GRÁFICO DIA MÚLTIPLO] Data solicitada: ${data || 'hoje'}`);

    // Buscar informações dos equipamentos
    const equipamentos = await this.prisma.equipamentos.findMany({
      where: {
        id: { in: equipamentosIds },
      },
      include: { tipo_equipamento_rel: true }
    });

    if (equipamentos.length === 0) {
      throw new NotFoundException('Nenhum equipamento válido encontrado');
    }

    // Definir a data (hoje se não especificada)
    const dataConsulta = data ? new Date(data) : new Date();
    dataConsulta.setHours(0, 0, 0, 0);

    const dataFim = new Date(dataConsulta);
    dataFim.setDate(dataFim.getDate() + 1);

    console.log(`📊 [GRÁFICO DIA MÚLTIPLO] Período de busca:`);
    console.log(`📊 [GRÁFICO DIA MÚLTIPLO]   De: ${dataConsulta.toISOString()}`);
    console.log(`📊 [GRÁFICO DIA MÚLTIPLO]   Até: ${dataFim.toISOString()}`);
    console.log(`📊 [GRÁFICO DIA MÚLTIPLO] Equipamentos encontrados: ${equipamentos.length}`);

    // Buscar dados de todos os equipamentos da tabela equipamentos_dados
    const dados = await this.prisma.equipamentos_dados.findMany({
      where: {
        equipamento_id: { in: equipamentosIds },
        timestamp_dados: {
          gte: dataConsulta,
          lt: dataFim,
        },
      },
      orderBy: { timestamp_dados: 'asc' },
      select: {
        equipamento_id: true,
        timestamp_dados: true,
        dados: true,
        qualidade: true,
      },
    });

    console.log(`📊 [GRÁFICO DIA MÚLTIPLO] Total de registros encontrados: ${dados.length}`);

    if (dados.length > 0) {
      console.log(`📊 [GRÁFICO DIA MÚLTIPLO] Amostra do primeiro registro:`, {
        equipamento_id: dados[0].equipamento_id,
        timestamp: dados[0].timestamp_dados,
        estrutura_dados: Object.keys(dados[0].dados as any),
      });
    }

    // Agrupar dados em intervalos de 5 minutos para reduzir variação
    const INTERVALO_MINUTOS = 5;
    const dadosAgrupados = new Map<string, {
      timestamp: Date;
      potenciasPorEquipamento: Map<string, number[]>; // Potências separadas por equipamento
    }>();

    dados.forEach((d: any) => {
      // Arredondar para o intervalo de 5 minutos
      const minuto = new Date(d.timestamp_dados);
      const minutosArredondados = Math.floor(minuto.getMinutes() / INTERVALO_MINUTOS) * INTERVALO_MINUTOS;
      minuto.setMinutes(minutosArredondados, 0, 0);
      const minutoKey = minuto.toISOString();

      if (!dadosAgrupados.has(minutoKey)) {
        dadosAgrupados.set(minutoKey, {
          timestamp: minuto,
          potenciasPorEquipamento: new Map(),
        });
      }

      const grupo = dadosAgrupados.get(minutoKey)!;

      // Extrair potência (suportar múltiplas estruturas)
      let potenciaKw = 0;
      // ✅ NOVO: Priorizar campo potencia_kw (M160 formato Resumo)
      if (d.dados.potencia_kw !== undefined) {
        potenciaKw = d.dados.potencia_kw;
      } else if (d.dados.power?.active_total !== undefined) {
        potenciaKw = d.dados.power.active_total / 1000;
      } else if (d.dados.dc?.total_power !== undefined) {
        potenciaKw = d.dados.dc.total_power / 1000;
      } else if (d.dados.power?.active !== undefined) {
        potenciaKw = d.dados.power.active / 1000;
      } else if (d.dados.power_avg !== undefined) {
        potenciaKw = d.dados.power_avg;
      } else if (d.dados.potencia_ativa_kw !== undefined) {
        potenciaKw = d.dados.potencia_ativa_kw;
      } else if (d.dados.Dados) {
        // M160 formato legado: calcular potência das fases
        const Pa = d.dados.Dados.Pa || 0;
        const Pb = d.dados.Dados.Pb || 0;
        const Pc = d.dados.Dados.Pc || 0;
        potenciaKw = (Pa + Pb + Pc) / 1000;
      }

      if (potenciaKw > 0) {
        // Agrupar leituras por equipamento para depois fazer média
        if (!grupo.potenciasPorEquipamento.has(d.equipamento_id)) {
          grupo.potenciasPorEquipamento.set(d.equipamento_id, []);
        }
        grupo.potenciasPorEquipamento.get(d.equipamento_id)!.push(potenciaKw);
      }
    });

    // Passo 1: Converter para array ordenado
    const pontosOrdenados = Array.from(dadosAgrupados.entries())
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());

    // Passo 2: Aplicar forward-fill para garantir que todos equipamentos contribuam sempre
    const ultimasPotencias = new Map<string, number>(); // Última potência conhecida de cada equipamento
    let pontosDebug = 0;

    const pontos = pontosOrdenados.map(([_, grupo], indice) => {
      // Atualizar últimas potências com os dados atuais
      grupo.potenciasPorEquipamento.forEach((potencias, equipamentoId) => {
        const mediaPorEquipamento = potencias.reduce((sum, p) => sum + p, 0) / potencias.length;
        ultimasPotencias.set(equipamentoId, mediaPorEquipamento);
      });

      // Calcular potência total usando TODAS as últimas potências conhecidas (forward-fill)
      let potenciaTotal = 0;
      const potenciasAtivas: number[] = [];
      let totalLeituras = 0;

      // Somar as últimas potências conhecidas de TODOS os equipamentos
      ultimasPotencias.forEach((potencia, equipamentoId) => {
        potenciaTotal += potencia;
        potenciasAtivas.push(potencia);
      });

      // Contar leituras do intervalo atual
      grupo.potenciasPorEquipamento.forEach((potencias) => {
        totalLeituras += potencias.length;
      });

      const potenciaMin = potenciasAtivas.length > 0 ? Math.min(...potenciasAtivas) : 0;
      const potenciaMax = potenciasAtivas.length > 0 ? Math.max(...potenciasAtivas) : 0;

      // Debug: Log primeiros 10 pontos e últimos 5
      if (pontosDebug < 10 || indice >= pontosOrdenados.length - 5) {
        pontosDebug++;
        console.log(`📊 [DEBUG PONTO ${indice}] ${grupo.timestamp.toLocaleTimeString('pt-BR')}:`);
        console.log(`  - Equipamentos ativos neste intervalo: ${grupo.potenciasPorEquipamento.size}`);
        console.log(`  - Total equipamentos rastreados: ${ultimasPotencias.size}`);
        const detalhes: string[] = [];
        ultimasPotencias.forEach((pot, id) => {
          const ativoAgora = grupo.potenciasPorEquipamento.has(id);
          detalhes.push(`${id.substring(0, 8)}: ${pot.toFixed(1)}kW ${ativoAgora ? '✓' : '(fill)'}`);
        });
        console.log(`  - Potências: [${detalhes.join(', ')}]`);
        console.log(`  - Total: ${potenciaTotal.toFixed(1)} kW`);
      }

      return {
        timestamp: grupo.timestamp,
        hora: grupo.timestamp.toISOString(),
        potencia_kw: potenciaTotal, // Soma de TODOS os equipamentos (usando forward-fill)
        potencia_min: potenciaMin,
        potencia_max: potenciaMax,
        potencia_media: ultimasPotencias.size > 0 ? potenciaTotal / ultimasPotencias.size : 0,
        num_inversores: ultimasPotencias.size, // Total de equipamentos rastreados
        num_inversores_ativos: grupo.potenciasPorEquipamento.size, // Equipamentos com dados neste intervalo
        num_leituras: totalLeituras,
        qualidade: 'GOOD',
      };
    });

    console.log(`📊 [GRÁFICO DIA MÚLTIPLO] Total de pontos processados: ${pontos.length}`);
    if (pontos.length > 0) {
      console.log(`📊 [GRÁFICO DIA MÚLTIPLO] Primeiro ponto:`, pontos[0]);
      console.log(`📊 [GRÁFICO DIA MÚLTIPLO] Último ponto:`, pontos[pontos.length - 1]);
    }

    // Passo 3: Aplicar suavização com média móvel para reduzir ruído
    // Usar janela de 3 pontos (15 minutos) para suavizar sem perder detalhes
    const JANELA_SUAVIZACAO = 3;
    const pontosSuavizados = pontos.map((ponto, indice) => {
      // Pegar pontos na janela (antes, atual, depois)
      const inicio = Math.max(0, indice - Math.floor(JANELA_SUAVIZACAO / 2));
      const fim = Math.min(pontos.length, indice + Math.floor(JANELA_SUAVIZACAO / 2) + 1);
      const pontosNaJanela = pontos.slice(inicio, fim);

      // Calcular média das potências na janela
      const potenciaMedia = pontosNaJanela.reduce((sum, p) => sum + p.potencia_kw, 0) / pontosNaJanela.length;

      // Log apenas para primeiros e últimos pontos
      if (pontosDebug < 10 || indice >= pontos.length - 5) {
        console.log(`📊 [SUAVIZAÇÃO PONTO ${indice}] Original: ${ponto.potencia_kw.toFixed(1)} kW → Suavizado: ${potenciaMedia.toFixed(1)} kW (janela de ${pontosNaJanela.length} pontos)`);
      }

      return {
        ...ponto,
        potencia_kw: potenciaMedia, // Substituir pela média suavizada
      };
    });

    console.log(`📊 [GRÁFICO DIA MÚLTIPLO] Aplicada suavização com janela de ${JANELA_SUAVIZACAO} pontos (${JANELA_SUAVIZACAO * INTERVALO_MINUTOS} minutos)`);

    return {
      data: dataConsulta.toISOString().split('T')[0],
      total_pontos: pontosSuavizados.length,
      total_inversores: equipamentos.length,
      inversores: equipamentos.map(eq => ({
        id: eq.id,
        nome: eq.nome,
      })),
      dados: pontosSuavizados,
    };
  }

  /**
   * Gráfico do Mês para Múltiplos Equipamentos - Soma das energias
   * Agrega dados de múltiplos equipamentos selecionados (usando equipamentos_dados)
   */
  async getGraficoMesMultiplosInversores(equipamentosIds: string[], mes?: string) {
    console.log(`\n📊 [GRÁFICO MÊS MÚLTIPLO] ========================================`);
    console.log(`📊 [GRÁFICO MÊS MÚLTIPLO] Equipamentos: ${equipamentosIds.join(', ')}`);
    console.log(`📊 [GRÁFICO MÊS MÚLTIPLO] Mês solicitado: ${mes || 'atual'}`);

    // Buscar informações dos equipamentos
    const equipamentos = await this.prisma.equipamentos.findMany({
      where: {
        id: { in: equipamentosIds },
      },
      include: { tipo_equipamento_rel: true }
    });

    if (equipamentos.length === 0) {
      throw new NotFoundException('Nenhum equipamento válido encontrado');
    }

    // Definir o mês
    const now = new Date();
    const ano = mes ? parseInt(mes.split('-')[0]) : now.getFullYear();
    const mesNum = mes ? parseInt(mes.split('-')[1]) : now.getMonth() + 1;

    const dataInicio = new Date(ano, mesNum - 1, 1);
    const dataFim = new Date(ano, mesNum, 1);

    console.log(`📊 [GRÁFICO MÊS MÚLTIPLO] Período de busca:`);
    console.log(`📊 [GRÁFICO MÊS MÚLTIPLO]   De: ${dataInicio.toISOString()}`);
    console.log(`📊 [GRÁFICO MÊS MÚLTIPLO]   Até: ${dataFim.toISOString()}`);
    console.log(`📊 [GRÁFICO MÊS MÚLTIPLO] Equipamentos encontrados: ${equipamentos.length}`);

    // Buscar dados de todos os equipamentos da tabela equipamentos_dados
    const dados = await this.prisma.equipamentos_dados.findMany({
      where: {
        equipamento_id: { in: equipamentosIds },
        timestamp_dados: {
          gte: dataInicio,
          lt: dataFim,
        },
      },
      orderBy: { timestamp_dados: 'asc' },
      select: {
        equipamento_id: true,
        timestamp_dados: true,
        dados: true,
      },
    });

    console.log(`📊 [GRÁFICO MÊS MÚLTIPLO] Total de registros encontrados: ${dados.length}`);

    // Agrupar dados por dia
    const dadosAgrupados = new Map<string, {
      data: Date;
      potencias: number[];
      energias: number[];
      equipamentos: Set<string>;
    }>();

    dados.forEach((d: any) => {
      // Obter apenas a data (sem hora)
      const data = new Date(d.timestamp_dados);
      data.setHours(0, 0, 0, 0);
      const dataKey = data.toISOString().split('T')[0];

      if (!dadosAgrupados.has(dataKey)) {
        dadosAgrupados.set(dataKey, {
          data: data,
          potencias: [],
          energias: [],
          equipamentos: new Set(),
        });
      }

      const grupo = dadosAgrupados.get(dataKey)!;

      // Extrair potência (suportar múltiplas estruturas)
      let potenciaKw = 0;
      // ✅ NOVO: Priorizar campo potencia_kw (M160 formato Resumo)
      if (d.dados.potencia_kw !== undefined) {
        potenciaKw = d.dados.potencia_kw;
      } else if (d.dados.power?.active_total !== undefined) {
        potenciaKw = d.dados.power.active_total / 1000;
      } else if (d.dados.dc?.total_power !== undefined) {
        potenciaKw = d.dados.dc.total_power / 1000;
      } else if (d.dados.power?.active !== undefined) {
        potenciaKw = d.dados.power.active / 1000;
      } else if (d.dados.power_avg !== undefined) {
        potenciaKw = d.dados.power_avg;
      } else if (d.dados.potencia_ativa_kw !== undefined) {
        potenciaKw = d.dados.potencia_ativa_kw;
      } else if (d.dados.Dados) {
        // M160 formato legado: calcular potência das fases
        const Pa = d.dados.Dados.Pa || 0;
        const Pb = d.dados.Dados.Pb || 0;
        const Pc = d.dados.Dados.Pc || 0;
        potenciaKw = (Pa + Pb + Pc) / 1000;
      }

      // Extrair energia se disponível
      // ✅ NOVO: Priorizar campo energia_kwh (M160 formato Resumo)
      let energiaKwh = 0;
      if (d.dados.energia_kwh !== undefined) {
        energiaKwh = d.dados.energia_kwh;
      } else if (d.dados.energy?.daily_yield !== undefined) {
        energiaKwh = d.dados.energy.daily_yield / 1000;
      } else if (d.dados.energy?.period_energy_kwh !== undefined) {
        energiaKwh = d.dados.energy.period_energy_kwh;
      } else if (d.dados.Dados?.period_energy_kwh !== undefined) {
        energiaKwh = d.dados.Dados.period_energy_kwh;
      }

      if (potenciaKw > 0) {
        grupo.potencias.push(potenciaKw);
        // Estimativa de energia: potência * tempo (1 minuto = 1/60 hora)
        grupo.energias.push(potenciaKw / 60);
        grupo.equipamentos.add(d.equipamento_id);
      }

      if (energiaKwh > 0) {
        grupo.energias.push(energiaKwh);
      }
    });

    // Converter para array e calcular agregações
    const pontos = Array.from(dadosAgrupados.entries())
      .map(([dataKey, grupo]) => {
        const energiaTotal = grupo.energias.reduce((sum, e) => sum + e, 0);
        const potenciaMedia = grupo.potencias.length > 0 ?
          grupo.potencias.reduce((sum, p) => sum + p, 0) / grupo.potencias.length : 0;
        const potenciaMax = grupo.potencias.length > 0 ? Math.max(...grupo.potencias) : 0;

        return {
          data: dataKey,
          dia: grupo.data.getDate(),
          energia_kwh: energiaTotal,
          potencia_media_kw: potenciaMedia,
          potencia_max_kw: potenciaMax,
          num_inversores: grupo.equipamentos.size,
          num_registros: grupo.potencias.length,
        };
      })
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

    const energiaTotal = pontos.reduce((sum, p) => sum + p.energia_kwh, 0);

    console.log(`📊 [GRÁFICO MÊS MÚLTIPLO] Dias com dados: ${pontos.length}`);
    console.log(`📊 [GRÁFICO MÊS MÚLTIPLO] Energia total: ${energiaTotal} kWh`);

    return {
      mes: `${ano}-${String(mesNum).padStart(2, '0')}`,
      total_dias: pontos.length,
      total_inversores: equipamentos.length,
      energia_total_kwh: energiaTotal,
      inversores: equipamentos.map(eq => ({
        id: eq.id,
        nome: eq.nome,
      })),
      dados: pontos,
    };
  }

  /**
   * Gráfico do Ano para Múltiplos Equipamentos - Soma das energias
   * Agrega dados de múltiplos equipamentos selecionados (usando equipamentos_dados)
   */
  async getGraficoAnoMultiplosInversores(equipamentosIds: string[], ano?: string) {
    console.log(`\n📊 [GRÁFICO ANO MÚLTIPLO] ========================================`);
    console.log(`📊 [GRÁFICO ANO MÚLTIPLO] Equipamentos: ${equipamentosIds.join(', ')}`);
    console.log(`📊 [GRÁFICO ANO MÚLTIPLO] Ano solicitado: ${ano || 'atual'}`);

    // Buscar informações dos equipamentos
    const equipamentos = await this.prisma.equipamentos.findMany({
      where: {
        id: { in: equipamentosIds },
      },
      include: { tipo_equipamento_rel: true }
    });

    if (equipamentos.length === 0) {
      throw new NotFoundException('Nenhum equipamento válido encontrado');
    }

    // Definir o ano
    const anoConsulta = ano ? parseInt(ano) : new Date().getFullYear();
    const dataInicio = new Date(anoConsulta, 0, 1);
    const dataFim = new Date(anoConsulta + 1, 0, 1);

    console.log(`📊 [GRÁFICO ANO MÚLTIPLO] Período de busca:`);
    console.log(`📊 [GRÁFICO ANO MÚLTIPLO]   De: ${dataInicio.toISOString()}`);
    console.log(`📊 [GRÁFICO ANO MÚLTIPLO]   Até: ${dataFim.toISOString()}`);
    console.log(`📊 [GRÁFICO ANO MÚLTIPLO] Equipamentos encontrados: ${equipamentos.length}`);

    // Buscar dados de todos os equipamentos da tabela equipamentos_dados
    const dados = await this.prisma.equipamentos_dados.findMany({
      where: {
        equipamento_id: { in: equipamentosIds },
        timestamp_dados: {
          gte: dataInicio,
          lt: dataFim,
        },
      },
      orderBy: { timestamp_dados: 'asc' },
      select: {
        equipamento_id: true,
        timestamp_dados: true,
        dados: true,
      },
    });

    console.log(`📊 [GRÁFICO ANO MÚLTIPLO] Total de registros encontrados: ${dados.length}`);

    // Agrupar dados por mês
    const dadosAgrupados = new Map<string, {
      mes: number;
      ano: number;
      potencias: number[];
      energias: number[];
      equipamentos: Set<string>;
    }>();

    dados.forEach((d: any) => {
      const data = new Date(d.timestamp_dados);
      const mesKey = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;

      if (!dadosAgrupados.has(mesKey)) {
        dadosAgrupados.set(mesKey, {
          mes: data.getMonth() + 1,
          ano: data.getFullYear(),
          potencias: [],
          energias: [],
          equipamentos: new Set(),
        });
      }

      const grupo = dadosAgrupados.get(mesKey)!;

      // Extrair potência (suportar múltiplas estruturas)
      let potenciaKw = 0;
      // ✅ NOVO: Priorizar campo potencia_kw (M160 formato Resumo)
      if (d.dados.potencia_kw !== undefined) {
        potenciaKw = d.dados.potencia_kw;
      } else if (d.dados.power?.active_total !== undefined) {
        potenciaKw = d.dados.power.active_total / 1000;
      } else if (d.dados.dc?.total_power !== undefined) {
        potenciaKw = d.dados.dc.total_power / 1000;
      } else if (d.dados.power?.active !== undefined) {
        potenciaKw = d.dados.power.active / 1000;
      } else if (d.dados.power_avg !== undefined) {
        potenciaKw = d.dados.power_avg;
      } else if (d.dados.potencia_ativa_kw !== undefined) {
        potenciaKw = d.dados.potencia_ativa_kw;
      } else if (d.dados.Dados) {
        // M160 formato legado: calcular potência das fases
        const Pa = d.dados.Dados.Pa || 0;
        const Pb = d.dados.Dados.Pb || 0;
        const Pc = d.dados.Dados.Pc || 0;
        potenciaKw = (Pa + Pb + Pc) / 1000;
      }

      // Extrair energia se disponível
      // ✅ NOVO: Priorizar campo energia_kwh (M160 formato Resumo)
      let energiaKwh = 0;
      if (d.dados.energia_kwh !== undefined) {
        energiaKwh = d.dados.energia_kwh;
      } else if (d.dados.energy?.daily_yield !== undefined) {
        energiaKwh = d.dados.energy.daily_yield / 1000;
      } else if (d.dados.energy?.period_energy_kwh !== undefined) {
        energiaKwh = d.dados.energy.period_energy_kwh;
      } else if (d.dados.Dados?.period_energy_kwh !== undefined) {
        energiaKwh = d.dados.Dados.period_energy_kwh;
      }

      if (potenciaKw > 0) {
        grupo.potencias.push(potenciaKw);
        // Estimativa de energia: potência * tempo (1 minuto = 1/60 hora)
        grupo.energias.push(potenciaKw / 60);
        grupo.equipamentos.add(d.equipamento_id);
      }

      if (energiaKwh > 0) {
        grupo.energias.push(energiaKwh);
      }
    });

    // Nomes dos meses em português
    const mesesPt = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    // Converter para array e calcular agregações
    const pontos = Array.from(dadosAgrupados.entries())
      .map(([mesKey, grupo]) => {
        const energiaTotal = grupo.energias.reduce((sum, e) => sum + e, 0);
        const potenciaMedia = grupo.potencias.length > 0 ?
          grupo.potencias.reduce((sum, p) => sum + p, 0) / grupo.potencias.length : 0;
        const potenciaMax = grupo.potencias.length > 0 ? Math.max(...grupo.potencias) : 0;

        return {
          mes: mesKey,
          mes_numero: grupo.mes,
          mes_nome: mesesPt[grupo.mes - 1],
          energia_kwh: energiaTotal,
          potencia_media_kw: potenciaMedia,
          potencia_max_kw: potenciaMax,
          num_inversores: grupo.equipamentos.size,
          num_registros: grupo.potencias.length,
        };
      })
      .sort((a, b) => a.mes_numero - b.mes_numero);

    const energiaTotal = pontos.reduce((sum, p) => sum + p.energia_kwh, 0);

    console.log(`📊 [GRÁFICO ANO MÚLTIPLO] Meses com dados: ${pontos.length}`);
    console.log(`📊 [GRÁFICO ANO MÚLTIPLO] Energia total: ${energiaTotal} kWh`);

    return {
      ano: anoConsulta,
      total_meses: pontos.length,
      total_inversores: equipamentos.length,
      energia_total_kwh: energiaTotal,
      inversores: equipamentos.map(eq => ({
        id: eq.id,
        nome: eq.nome,
      })),
      dados: pontos,
    };
  }

  /**
   * Gráfico do Ano - Energia gerada por mês
   * Soma a energia de todos os minutos de cada mês
   */
  async getGraficoAno(equipamentoId: string, ano?: string) {
    console.log(`\n📊 [GRÁFICO ANO] ========================================`);
    console.log(`📊 [GRÁFICO ANO] Equipamento: ${equipamentoId}`);
    console.log(`📊 [GRÁFICO ANO] Ano solicitado: ${ano || 'atual'}`);

    // Verificar o tipo do equipamento
    const equipamento = await this.prisma.equipamentos.findUnique({
      where: { id: equipamentoId },
      include: { tipo_equipamento_rel: true }
    });

    if (!equipamento) {
      throw new NotFoundException(`Equipamento ${equipamentoId} não encontrado`);
    }

    // Definir o ano (atual se não especificado)
    const anoConsulta = ano ? parseInt(ano) : new Date().getFullYear();

    const dataInicio = new Date(anoConsulta, 0, 1);
    const dataFim = new Date(anoConsulta + 1, 0, 1);

    console.log(`📊 [GRÁFICO ANO] Período de busca:`);
    console.log(`📊 [GRÁFICO ANO]   De: ${dataInicio.toISOString()}`);
    console.log(`📊 [GRÁFICO ANO]   Até: ${dataFim.toISOString()}`);
    console.log(`📊 [GRÁFICO ANO] Tipo do equipamento: ${equipamento.tipo_equipamento_rel?.codigo}`);

    let dados: any[] = [];

    // Se for INVERSOR, buscar da tabela inversor_leituras
    if (equipamento.tipo_equipamento_rel?.codigo === 'INVERSOR') {
      console.log(`📊 [GRÁFICO ANO] Buscando dados de INVERSOR na tabela inversor_leituras`);

      // Mapear o ID do equipamento para o ID do inversor
      const inversorMap: Record<string, number> = {
        'cmhcfyoj30003jqo8bhhaexlp': 3, // Inversor 3
        'cmhdd6wkv001kjqo8rl39taa6': 2, // Inversor 2
        'cmhddtv0h0024jqo8h4dzm4gq': 1, // Inversor 1
      };

      const inversorId = inversorMap[equipamentoId.trim()];

      if (inversorId) {
        dados = await this.prisma.$queryRaw<Array<any>>`
          SELECT
            DATE_TRUNC('month', timestamp) as mes,
            TO_CHAR(timestamp, 'YYYY-MM') as mes_formatado,
            TO_CHAR(timestamp, 'TMMonth') as mes_nome,
            -- Calcular energia assumindo que cada leitura representa consumo constante no período
            SUM(active_power::numeric / 1000.0 / 60.0) as energia_kwh,
            COUNT(*) as num_registros,
            AVG(active_power::numeric / 1000.0) as potencia_media_kw,
            MAX(active_power::numeric / 1000.0) as potencia_max_kw
          FROM inversor_leituras
          WHERE inversor_id = ${inversorId}
            AND timestamp >= ${dataInicio}
            AND timestamp < ${dataFim}
          GROUP BY DATE_TRUNC('month', timestamp), TO_CHAR(timestamp, 'YYYY-MM'), TO_CHAR(timestamp, 'TMMonth')
          ORDER BY mes ASC
        `;
      }
    } else {
      // Para outros equipamentos, usar a query original
      dados = await this.prisma.$queryRaw<Array<any>>`
        SELECT
          DATE_TRUNC('month', timestamp_dados) as mes,
          TO_CHAR(timestamp_dados, 'YYYY-MM') as mes_formatado,
          TO_CHAR(timestamp_dados, 'TMMonth') as mes_nome,
          SUM(
            COALESCE(
              (dados->'energy'->>'period_energy_kwh')::numeric,
              (dados->>'energia_kwh')::numeric
            )
          ) as energia_kwh,
          COUNT(*) as num_registros,
          AVG(
            COALESCE(
              (dados->'power'->>'active_total')::numeric / 1000.0,
              (dados->>'power_avg')::numeric
            )
          ) as potencia_media_kw
        FROM equipamentos_dados
        WHERE equipamento_id = ${equipamentoId}
          AND timestamp_dados >= ${dataInicio}
          AND timestamp_dados < ${dataFim}
          AND num_leituras IS NOT NULL
          AND (
            dados->'energy'->>'period_energy_kwh' IS NOT NULL
            OR dados->>'energia_kwh' IS NOT NULL
          )
        GROUP BY DATE_TRUNC('month', timestamp_dados), TO_CHAR(timestamp_dados, 'YYYY-MM'), TO_CHAR(timestamp_dados, 'TMMonth')
        ORDER BY mes ASC
      `;
    }

    console.log(`📊 [GRÁFICO ANO] Meses com dados: ${dados.length}`);
    if (dados.length > 0) {
      console.log(`📊 [GRÁFICO ANO] Primeiro mês:`, {
        mes: dados[0].mes_formatado,
        energia_kwh: dados[0].energia_kwh,
        num_registros: dados[0].num_registros,
        potencia_media_kw: dados[0].potencia_media_kw,
      });
    }

    // Nomes dos meses em português
    const mesesPt = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    // Transformar para formato do gráfico
    const pontos = dados.map((d: any) => {
      const mesNum = parseInt(d.mes_formatado.split('-')[1]);
      return {
        mes: d.mes_formatado,
        mes_numero: mesNum,
        mes_nome: mesesPt[mesNum - 1],
        energia_kwh: parseFloat(d.energia_kwh) || 0,
        potencia_media_kw: parseFloat(d.potencia_media_kw) || 0,
        num_registros: parseInt(d.num_registros),
      };
    });

    const energiaTotal = pontos.reduce((sum, p) => sum + p.energia_kwh, 0);

    console.log(`📊 [GRÁFICO ANO] Total de pontos: ${pontos.length}`);
    console.log(`📊 [GRÁFICO ANO] Energia total: ${energiaTotal} kWh`);
    console.log(`📊 [GRÁFICO ANO] ========================================\n`);

    return {
      ano: anoConsulta,
      total_meses: pontos.length,
      energia_total_kwh: energiaTotal,
      dados: pontos,
    };
  }
}
