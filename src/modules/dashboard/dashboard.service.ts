import { Injectable } from '@nestjs/common';
import { PrismaService, PermissionScopeService, PlantaScope } from '@aupus/api-shared';
import { DashboardOverviewDto } from './dto/overview.dto';
import { DashboardWorkOrdersDto } from './dto/work-orders.dto';
import { DashboardTaskPrioritiesDto } from './dto/task-priorities.dto';
import { DashboardSeverityDistributionDto } from './dto/severity-distribution.dto';
import { DashboardPlannedVsCompletedDto } from './dto/planned-vs-completed.dto';
import { DashboardSystemStatusDto } from './dto/system-status.dto';

type UserCtx = { id: string; role?: string | null } | undefined;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: PermissionScopeService,
  ) {}

  // ---------------------------------------------------------------
  // Helpers de data-scoping por role
  // ---------------------------------------------------------------

  private async getScope(user?: UserCtx): Promise<PlantaScope> {
    if (!user?.id) return null;
    return this.scopeService.getPlantasDoUsuario(user.id, user.role);
  }

  /** Filtro para `equipamentos` (planta via unidade). `{}` quando sem escopo. */
  private eqFilter(scope: PlantaScope): Record<string, any> {
    if (!Array.isArray(scope)) return {};
    if (scope.length === 0) return { id: '__NEVER__' };
    return { unidade: { planta_id: { in: scope } } };
  }

  /** Filtro para `anomalias` (pode ter planta_id direto OU via equipamento). */
  private anomFilter(scope: PlantaScope): Record<string, any> {
    if (!Array.isArray(scope)) return {};
    if (scope.length === 0) return { id: '__NEVER__' };
    return {
      OR: [
        { planta_id: { in: scope } },
        { equipamento: { unidade: { planta_id: { in: scope } } } },
      ],
    };
  }

  /** Filtro para `ordens_servico` / `programacoes_os` / `tarefas` (tem `planta_id` direto). */
  private plantaIdFilter(scope: PlantaScope): Record<string, any> {
    if (!Array.isArray(scope)) return {};
    if (scope.length === 0) return { id: '__NEVER__' };
    return { planta_id: { in: scope } };
  }

  // ---------------------------------------------------------------
  // Endpoints
  // ---------------------------------------------------------------

  async getOverview(user?: UserCtx): Promise<DashboardOverviewDto> {
    const scope = await this.getScope(user);
    const eq = this.eqFilter(scope);
    const anom = this.anomFilter(scope);
    const os = this.plantaIdFilter(scope);

    const [
      totalEquipamentos,
      equipamentosComFalhas,
      equipamentosParados,
      osAbertas,
      osEmExecucao,
      osFinalizadas,
    ] = await Promise.all([
      this.prisma.equipamentos.count({ where: { deleted_at: null, ...eq } }),

      this.prisma.equipamentos.count({
        where: {
          deleted_at: null,
          ...eq,
          anomalias: {
            some: {
              deleted_at: null,
              status: { in: ['REGISTRADA', 'PROGRAMADA'] },
            },
          },
        },
      }),

      this.prisma.equipamentos.count({
        where: { deleted_at: null, status: 'PARADO', ...eq },
      }),

      this.prisma.ordens_servico.count({
        where: { deletado_em: null, status: 'PENDENTE', ...os },
      }),

      this.prisma.ordens_servico.count({
        where: { deletado_em: null, status: 'EM_EXECUCAO', ...os },
      }),

      this.prisma.ordens_servico.count({
        where: { deletado_em: null, status: 'FINALIZADA', ...os },
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

  async getWorkOrders(user?: UserCtx): Promise<DashboardWorkOrdersDto> {
    const scope = await this.getScope(user);
    const os = this.plantaIdFilter(scope);
    const hoje = new Date();

    const [osAbertas, osFinalizadas, osAtrasadas, avaliacaoMedia] =
      await Promise.all([
        this.prisma.ordens_servico.count({
          where: { deletado_em: null, status: 'PENDENTE', ...os },
        }),

        this.prisma.ordens_servico.count({
          where: { deletado_em: null, status: 'FINALIZADA', ...os },
        }),

        this.prisma.ordens_servico.count({
          where: {
            deletado_em: null,
            status: { notIn: ['FINALIZADA', 'CANCELADA'] },
            ...os,
            programacao: {
              data_previsao_fim: { lt: hoje },
            },
          },
        }),

        this.prisma.ordens_servico.aggregate({
          where: {
            deletado_em: null,
            status: 'FINALIZADA',
            avaliacao_qualidade: { not: null },
            ...os,
          },
          _avg: { avaliacao_qualidade: true },
        }),
      ]);

    const totalOS = osAbertas + osFinalizadas;
    const indicadorCargaTrabalho =
      totalOS > 0 ? Math.round((osAbertas / totalOS) * 100) : 0;

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

  async getTaskPriorities(user?: UserCtx): Promise<DashboardTaskPrioritiesDto> {
    const scope = await this.getScope(user);
    const baseTarefaWhere: any = { deleted_at: null, status: 'ATIVA' };
    if (Array.isArray(scope)) {
      if (scope.length === 0) baseTarefaWhere.id = '__NEVER__';
      else {
        baseTarefaWhere.OR = [
          { planta_id: { in: scope } },
          { equipamento: { unidade: { planta_id: { in: scope } } } },
        ];
      }
    }

    const tarefas = await this.prisma.tarefas.findMany({
      where: baseTarefaWhere,
      include: {
        equipamento: { select: { nome: true } },
      },
      orderBy: [{ criticidade: 'desc' }, { created_at: 'desc' }],
      take: 10,
    });

    const [totalAtivas, critMuitoAlta, critAlta] = await Promise.all([
      this.prisma.tarefas.count({ where: baseTarefaWhere }),
      this.prisma.tarefas.count({ where: { ...baseTarefaWhere, criticidade: 5 } }),
      this.prisma.tarefas.count({ where: { ...baseTarefaWhere, criticidade: 4 } }),
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

  async getSeverityDistribution(user?: UserCtx): Promise<DashboardSeverityDistributionDto> {
    const scope = await this.getScope(user);
    const anom = this.anomFilter(scope);
    const baseWhere = {
      deleted_at: null,
      status: { in: ['REGISTRADA', 'PROGRAMADA'] as any },
      ...anom,
    };

    const distribuicao = await this.prisma.anomalias.groupBy({
      by: ['prioridade'],
      where: baseWhere,
      _count: true,
    });

    const totalAnomalias = await this.prisma.anomalias.count({ where: baseWhere });

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

  async getPlannedVsCompleted(user?: UserCtx): Promise<DashboardPlannedVsCompletedDto> {
    const scope = await this.getScope(user);
    const os = this.plantaIdFilter(scope);

    const hoje = new Date();
    const seiseMesesAtras = new Date(hoje);
    seiseMesesAtras.setMonth(hoje.getMonth() - 6);

    const ordens = await this.prisma.ordens_servico.findMany({
      where: {
        deletado_em: null,
        criado_em: { gte: seiseMesesAtras },
        ...os,
      },
      select: { id: true, status: true, criado_em: true },
    });

    const mesesMap = new Map<
      number,
      { planejadas: number; concluidas: number }
    >();

    ordens.forEach((o) => {
      const mes = o.criado_em.getMonth();
      if (!mesesMap.has(mes)) mesesMap.set(mes, { planejadas: 0, concluidas: 0 });
      const stats = mesesMap.get(mes)!;
      stats.planejadas++;
      if (o.status === 'FINALIZADA') stats.concluidas++;
    });

    const nomeMeses = [
      'Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez',
    ];

    const meses: any[] = [];
    let totalPlanejadas = 0;
    let totalConcluidas = 0;

    for (let i = 5; i >= 0; i--) {
      const data = new Date(hoje);
      data.setMonth(hoje.getMonth() - i);
      const mesNumero = data.getMonth();
      const stats = mesesMap.get(mesNumero) || { planejadas: 0, concluidas: 0 };
      const taxaConclusao = stats.planejadas > 0
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

    const taxaConclusaoMedia = totalPlanejadas > 0
      ? Math.round((totalConcluidas / totalPlanejadas) * 100 * 10) / 10
      : 0;

    return {
      meses,
      total_planejadas: totalPlanejadas,
      total_concluidas: totalConcluidas,
      taxa_conclusao_media: taxaConclusaoMedia,
    };
  }

  async getSystemStatus(user?: UserCtx): Promise<DashboardSystemStatusDto> {
    const scope = await this.getScope(user);
    const eq = this.eqFilter(scope);
    const anom = this.anomFilter(scope);

    const [
      equipamentosStatusCritico,
      equipamentosClasseCritica,
      falhasCausandoDanos,
    ] = await Promise.all([
      this.prisma.equipamentos.count({
        where: { deleted_at: null, status: { in: ['PARADO', 'FALHA'] }, ...eq },
      }),

      this.prisma.equipamentos.count({
        where: { deleted_at: null, classificacao: 'CRITICO', ...eq },
      }),

      this.prisma.anomalias.count({
        where: {
          deleted_at: null,
          prioridade: 'CRITICA',
          status: { in: ['REGISTRADA', 'PROGRAMADA'] },
          ...anom,
        },
      }),
    ]);

    return {
      paradas_programadas: 0, // TODO: definir criterio
      equipamentos_status_critico: equipamentosStatusCritico,
      equipamentos_classe_critica: equipamentosClasseCritica,
      paradas_nao_programadas: 0, // TODO
      falhas_causando_danos: falhasCausandoDanos,
      sensores_danificados: 0, // TODO
    };
  }
}
