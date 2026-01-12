import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { DashboardOverviewDto } from './dto/overview.dto';
import { DashboardWorkOrdersDto } from './dto/work-orders.dto';
import { DashboardTaskPrioritiesDto } from './dto/task-priorities.dto';
import { DashboardSeverityDistributionDto } from './dto/severity-distribution.dto';
import { DashboardPlannedVsCompletedDto } from './dto/planned-vs-completed.dto';
import { DashboardSystemStatusDto } from './dto/system-status.dto';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retorna visão geral do dashboard com métricas de equipamentos e OS
   */
  async getOverview(): Promise<DashboardOverviewDto> {
    const [
      totalEquipamentos,
      equipamentosComFalhas,
      equipamentosParados,
      osAbertas,
      osEmExecucao,
      osFinalizadas,
    ] = await Promise.all([
      // Total de equipamentos ativos
      this.prisma.equipamentos.count({
        where: { deleted_at: null },
      }),

      // Equipamentos com anomalias ativas
      this.prisma.equipamentos.count({
        where: {
          deleted_at: null,
          anomalias: {
            some: {
              deleted_at: null,
              status: { in: ['AGUARDANDO', 'EM_ANALISE', 'OS_GERADA'] },
            },
          },
        },
      }),

      // Equipamentos com status PARADO
      this.prisma.equipamentos.count({
        where: {
          deleted_at: null,
          status: 'PARADO',
        },
      }),

      // OS abertas (PLANEJADA ou PROGRAMADA)
      this.prisma.ordens_servico.count({
        where: {
          deletado_em: null,
          status: { in: ['PLANEJADA', 'PROGRAMADA'] },
        },
      }),

      // OS em execução
      this.prisma.ordens_servico.count({
        where: {
          deletado_em: null,
          status: 'EM_EXECUCAO',
        },
      }),

      // OS finalizadas
      this.prisma.ordens_servico.count({
        where: {
          deletado_em: null,
          status: 'FINALIZADA',
        },
      }),
    ]);

    return {
      total_equipamentos: totalEquipamentos,
      equipamentos_com_falhas: equipamentosComFalhas,
      equipamentos_parados: equipamentosParados,
      os_abertas: osAbertas,
      os_em_execucao: osEmExecucao,
      os_finalizadas: osFinalizadas,
    };
  }

  /**
   * Retorna métricas de ordens de serviço
   */
  async getWorkOrders(): Promise<DashboardWorkOrdersDto> {
    const hoje = new Date();

    const [osAbertas, osFinalizadas, osAtrasadas, avaliacaoMedia] =
      await Promise.all([
        // OS abertas
        this.prisma.ordens_servico.count({
          where: {
            deletado_em: null,
            status: { in: ['PLANEJADA', 'PROGRAMADA'] },
          },
        }),

        // OS finalizadas
        this.prisma.ordens_servico.count({
          where: {
            deletado_em: null,
            status: 'FINALIZADA',
          },
        }),

        // OS atrasadas (data_previsao_fim da programação no passado e ainda não finalizadas)
        this.prisma.ordens_servico.count({
          where: {
            deletado_em: null,
            status: { notIn: ['FINALIZADA', 'CANCELADA'] },
            programacao: {
              data_previsao_fim: { lt: hoje },
            },
          },
        }),

        // Média de avaliação de qualidade das OS finalizadas
        this.prisma.ordens_servico.aggregate({
          where: {
            deletado_em: null,
            status: 'FINALIZADA',
            avaliacao_qualidade: { not: null },
          },
          _avg: {
            avaliacao_qualidade: true,
          },
        }),
      ]);

    // Calcular indicador de carga de trabalho (0-100)
    // Fórmula: (OS abertas / (OS abertas + OS finalizadas)) * 100
    const totalOS = osAbertas + osFinalizadas;
    const indicadorCargaTrabalho =
      totalOS > 0 ? Math.round((osAbertas / totalOS) * 100) : 0;

    // Nota de qualidade (0-100) - avaliacao_qualidade é escala 1-5
    const notaQualidade = avaliacaoMedia._avg.avaliacao_qualidade
      ? Math.round((avaliacaoMedia._avg.avaliacao_qualidade / 5) * 100)
      : 0;

    return {
      os_abertas: osAbertas,
      nota_qualidade: notaQualidade,
      os_atrasadas: osAtrasadas,
      os_finalizadas: osFinalizadas,
      indicador_carga_trabalho: indicadorCargaTrabalho,
    };
  }

  /**
   * Retorna tarefas ordenadas por prioridade/criticidade
   */
  async getTaskPriorities(): Promise<DashboardTaskPrioritiesDto> {
    // Buscar tarefas ativas ordenadas por criticidade (5 = mais crítico)
    const tarefas = await this.prisma.tarefas.findMany({
      where: {
        deleted_at: null,
        status: 'ATIVA',
      },
      include: {
        equipamento: {
          select: { nome: true },
        },
      },
      orderBy: [{ criticidade: 'desc' }, { created_at: 'desc' }],
      take: 10, // Top 10 tarefas mais críticas
    });

    const [totalAtivas, critMuitoAlta, critAlta] = await Promise.all([
      // Total de tarefas ativas
      this.prisma.tarefas.count({
        where: { deleted_at: null, status: 'ATIVA' },
      }),

      // Criticidade muito alta (5)
      this.prisma.tarefas.count({
        where: { deleted_at: null, status: 'ATIVA', criticidade: 5 },
      }),

      // Criticidade alta (4)
      this.prisma.tarefas.count({
        where: { deleted_at: null, status: 'ATIVA', criticidade: 4 },
      }),
    ]);

    return {
      tarefas: tarefas.map((t) => ({
        id: t.id,
        nome: t.nome,
        criticidade: t.criticidade,
        status: t.status,
        equipamento_nome: t.equipamento?.nome || 'Sem equipamento',
        criado_em: t.created_at,
      })),
      total_tarefas_ativas: totalAtivas,
      tarefas_criticidade_muito_alta: critMuitoAlta,
      tarefas_criticidade_alta: critAlta,
    };
  }

  /**
   * Retorna distribuição de anomalias por prioridade
   */
  async getSeverityDistribution(): Promise<DashboardSeverityDistributionDto> {
    const distribuicao = await this.prisma.anomalias.groupBy({
      by: ['prioridade'],
      where: {
        deleted_at: null,
        status: { in: ['AGUARDANDO', 'EM_ANALISE', 'OS_GERADA'] }, // Anomalias ativas
      },
      _count: true,
    });

    const totalAnomalias = await this.prisma.anomalias.count({
      where: {
        deleted_at: null,
        status: { in: ['AGUARDANDO', 'EM_ANALISE', 'OS_GERADA'] },
      },
    });

    // Helper para extrair count por prioridade
    const contarPorPrioridade = (prioridade: string): number => {
      const item = distribuicao.find((d) => d.prioridade === prioridade);
      return item?._count || 0;
    };

    return {
      baixa: contarPorPrioridade('BAIXA'),
      media: contarPorPrioridade('MEDIA'),
      alta: contarPorPrioridade('ALTA'),
      critica: contarPorPrioridade('CRITICA'),
      total_anomalias: totalAnomalias,
    };
  }

  /**
   * Retorna comparação de OS planejadas vs concluídas (últimos 6 meses)
   */
  async getPlannedVsCompleted(): Promise<DashboardPlannedVsCompletedDto> {
    const hoje = new Date();
    const seiseMesesAtras = new Date(hoje);
    seiseMesesAtras.setMonth(hoje.getMonth() - 6);

    // Buscar todas as OS dos últimos 6 meses
    const ordens = await this.prisma.ordens_servico.findMany({
      where: {
        deletado_em: null,
        criado_em: { gte: seiseMesesAtras },
      },
      select: {
        id: true,
        status: true,
        criado_em: true,
      },
    });

    // Agrupar por mês
    const mesesMap = new Map<
      number,
      { planejadas: number; concluidas: number }
    >();

    ordens.forEach((os) => {
      const mes = os.criado_em.getMonth(); // 0-11
      if (!mesesMap.has(mes)) {
        mesesMap.set(mes, { planejadas: 0, concluidas: 0 });
      }

      const stats = mesesMap.get(mes)!;
      stats.planejadas++;
      if (os.status === 'FINALIZADA') {
        stats.concluidas++;
      }
    });

    // Nomes dos meses
    const nomeMeses = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
    ];

    // Construir array dos últimos 6 meses
    const meses = [];
    let totalPlanejadas = 0;
    let totalConcluidas = 0;

    for (let i = 5; i >= 0; i--) {
      const data = new Date(hoje);
      data.setMonth(hoje.getMonth() - i);
      const mesNumero = data.getMonth();

      const stats = mesesMap.get(mesNumero) || { planejadas: 0, concluidas: 0 };
      const taxaConclusao =
        stats.planejadas > 0
          ? Math.round((stats.concluidas / stats.planejadas) * 100)
          : 0;

      meses.push({
        mes: nomeMeses[mesNumero],
        mes_numero: mesNumero + 1,
        planejadas: stats.planejadas,
        concluidas: stats.concluidas,
        taxa_conclusao: taxaConclusao,
      });

      totalPlanejadas += stats.planejadas;
      totalConcluidas += stats.concluidas;
    }

    const taxaConclusaoMedia =
      totalPlanejadas > 0
        ? Math.round((totalConcluidas / totalPlanejadas) * 100 * 10) / 10
        : 0;

    return {
      meses,
      total_planejadas: totalPlanejadas,
      total_concluidas: totalConcluidas,
      taxa_conclusao_media: taxaConclusaoMedia,
    };
  }

  /**
   * Retorna status do sistema
   * NOTA: Alguns campos retornam 0 (TODO) pois precisam de definição de regra de negócio
   */
  async getSystemStatus(): Promise<DashboardSystemStatusDto> {
    const [
      equipamentosStatusCritico,
      equipamentosClasseCritica,
      falhasCausandoDanos,
    ] = await Promise.all([
      // Equipamentos com status PARADO ou FALHA
      this.prisma.equipamentos.count({
        where: {
          deleted_at: null,
          status: { in: ['PARADO', 'FALHA'] },
        },
      }),

      // Equipamentos com classificação CRITICO
      this.prisma.equipamentos.count({
        where: {
          deleted_at: null,
          classificacao: 'CRITICO',
        },
      }),

      // Anomalias com prioridade CRITICA
      this.prisma.anomalias.count({
        where: {
          deleted_at: null,
          prioridade: 'CRITICA',
          status: { in: ['AGUARDANDO', 'EM_ANALISE', 'OS_GERADA'] },
        },
      }),
    ]);

    return {
      paradas_programadas: 0, // TODO: definir critério (programacoes_os com data futura?)
      equipamentos_status_critico: equipamentosStatusCritico,
      equipamentos_classe_critica: equipamentosClasseCritica,
      paradas_nao_programadas: 0, // TODO: definir critério
      falhas_causando_danos: falhasCausandoDanos,
      sensores_danificados: 0, // TODO: definir critério (campo específico?)
    };
  }
}
