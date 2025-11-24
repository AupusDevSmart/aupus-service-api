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
    console.log(`\n📊 [GRÁFICO DIA] ========================================`);
    console.log(`📊 [GRÁFICO DIA] Equipamento: ${equipamentoId}`);
    console.log(`📊 [GRÁFICO DIA] Data solicitada: ${data || 'hoje'}`);

    // Definir a data (hoje se não especificada)
    const dataConsulta = data ? new Date(data) : new Date();
    dataConsulta.setHours(0, 0, 0, 0);

    const dataFim = new Date(dataConsulta);
    dataFim.setDate(dataFim.getDate() + 1);

    console.log(`📊 [GRÁFICO DIA] Período de busca:`);
    console.log(`📊 [GRÁFICO DIA]   De: ${dataConsulta.toISOString()}`);
    console.log(`📊 [GRÁFICO DIA]   Até: ${dataFim.toISOString()}`);

    // Buscar dados agregados do dia
    const dados = await this.prisma.equipamentos_dados.findMany({
      where: {
        equipamento_id: equipamentoId,
        timestamp_dados: {
          gte: dataConsulta,
          lt: dataFim,
        },
        // Filtr apenas dados com num_leituras (dados agregados)
        num_leituras: {
          not: null,
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

    console.log(`📊 [GRÁFICO DIA] Registros encontrados: ${dados.length}`);

    if (dados.length > 0) {
      console.log(`📊 [GRÁFICO DIA] Amostra do primeiro registro:`);
      console.log(`📊 [GRÁFICO DIA]   Timestamp: ${dados[0].timestamp_dados}`);
      console.log(`📊 [GRÁFICO DIA]   Num leituras: ${dados[0].num_leituras}`);
      console.log(`📊 [GRÁFICO DIA]   Estrutura power:`, (dados[0].dados as any).power);
      console.log(`📊 [GRÁFICO DIA]   Estrutura energy:`, (dados[0].dados as any).energy);
    }

    // Transformar para formato do gráfico
    const pontos = dados.map((d: any) => {
      // Suportar tanto estrutura nova (aninhada) quanto legada (achatada)
      const potenciaKw = d.dados.power?.active_total
        ? d.dados.power.active_total / 1000  // Estrutura nova: converter W para kW
        : (d.dados.power_avg || 0);           // Estrutura legada

      return {
        timestamp: d.timestamp_dados,
        hora: d.timestamp_dados.toISOString(),
        potencia_kw: potenciaKw,
        potencia_min: d.dados.power_min,  // Legado (não há min/max na nova estrutura)
        potencia_max: d.dados.power_max,  // Legado (não há min/max na nova estrutura)
        num_leituras: d.num_leituras,
        qualidade: d.qualidade,
      };
    });

    console.log(`📊 [GRÁFICO DIA] Total de pontos processados: ${pontos.length}`);
    if (pontos.length > 0) {
      console.log(`📊 [GRÁFICO DIA] Primeiro ponto:`, pontos[0]);
    }
    console.log(`📊 [GRÁFICO DIA] ========================================\n`);

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

    // Definir o mês (atual se não especificado)
    const now = new Date();
    const ano = mes ? parseInt(mes.split('-')[0]) : now.getFullYear();
    const mesNum = mes ? parseInt(mes.split('-')[1]) : now.getMonth() + 1;

    const dataInicio = new Date(ano, mesNum - 1, 1);
    const dataFim = new Date(ano, mesNum, 1);

    console.log(`📊 [GRÁFICO MÊS] Período de busca:`);
    console.log(`📊 [GRÁFICO MÊS]   De: ${dataInicio.toISOString()}`);
    console.log(`📊 [GRÁFICO MÊS]   Até: ${dataFim.toISOString()}`);

    // Buscar dados agregados do mês e somar por dia
    // Suporta tanto estrutura nova (energy.period_energy_kwh) quanto legada (energia_kwh)
    const dados = await this.prisma.$queryRaw<Array<any>>`
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
   * Gráfico do Ano - Energia gerada por mês
   * Soma a energia de todos os minutos de cada mês
   */
  async getGraficoAno(equipamentoId: string, ano?: string) {
    console.log(`\n📊 [GRÁFICO ANO] ========================================`);
    console.log(`📊 [GRÁFICO ANO] Equipamento: ${equipamentoId}`);
    console.log(`📊 [GRÁFICO ANO] Ano solicitado: ${ano || 'atual'}`);

    // Definir o ano (atual se não especificado)
    const anoConsulta = ano ? parseInt(ano) : new Date().getFullYear();

    const dataInicio = new Date(anoConsulta, 0, 1);
    const dataFim = new Date(anoConsulta + 1, 0, 1);

    console.log(`📊 [GRÁFICO ANO] Período de busca:`);
    console.log(`📊 [GRÁFICO ANO]   De: ${dataInicio.toISOString()}`);
    console.log(`📊 [GRÁFICO ANO]   Até: ${dataFim.toISOString()}`);

    // Buscar dados agregados do ano e somar por mês
    // Suporta tanto estrutura nova (energy.period_energy_kwh) quanto legada (energia_kwh)
    const dados = await this.prisma.$queryRaw<Array<any>>`
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
