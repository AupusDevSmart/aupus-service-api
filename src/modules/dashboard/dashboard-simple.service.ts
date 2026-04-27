import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, PermissionScopeService, PlantaScope } from '@aupus/api-shared';

type UserCtx = { id: string; role?: string | null } | undefined;

@Injectable()
export class DashboardSimpleService {
  private readonly logger = new Logger(DashboardSimpleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: PermissionScopeService,
  ) {}

  private async getScope(user?: UserCtx): Promise<PlantaScope> {
    if (!user?.id) return null;
    return this.scopeService.getPlantasDoUsuario(user.id, user.role);
  }

  private plantaIdIn(scope: PlantaScope): Record<string, any> {
    if (!Array.isArray(scope)) return {};
    if (scope.length === 0) return { id: '__NEVER__' };
    return { planta_id: { in: scope } };
  }

  private eqViaUnidade(scope: PlantaScope): Record<string, any> {
    if (!Array.isArray(scope)) return {};
    if (scope.length === 0) return { id: '__NEVER__' };
    return { unidade: { planta_id: { in: scope } } };
  }

  private anomEither(scope: PlantaScope): Record<string, any> {
    if (!Array.isArray(scope)) return {};
    if (scope.length === 0) return { id: '__NEVER__' };
    return {
      OR: [
        { planta_id: { in: scope } },
        { equipamento: { unidade: { planta_id: { in: scope } } } },
      ],
    };
  }

  private tarefaEither(scope: PlantaScope): Record<string, any> {
    if (!Array.isArray(scope)) return {};
    if (scope.length === 0) return { id: '__NEVER__' };
    return {
      OR: [
        { planta_id: { in: scope } },
        { equipamento: { unidade: { planta_id: { in: scope } } } },
      ],
    };
  }

  /** planos_manutencao nao tem planta_id direto - so via equipamento.unidade.planta_id. */
  private planoFilter(scope: PlantaScope): Record<string, any> {
    if (!Array.isArray(scope)) return {};
    if (scope.length === 0) return { id: '__NEVER__' };
    return { equipamento: { unidade: { planta_id: { in: scope } } } };
  }

  async getSimpleDashboard(filters: any, user?: UserCtx) {
    try {
      const scope = await this.getScope(user);
      this.logger.log(
        `[dashboard-advanced] user=${user?.id ?? 'anon'} role=${user?.role ?? 'null'} scope=${scope === null ? 'GLOBAL' : JSON.stringify(scope)}`,
      );

      const eqF = this.eqViaUnidade(scope);
      const osF = this.plantaIdIn(scope);
      const anomF = this.anomEither(scope);
      const tarefaF = this.tarefaEither(scope);
      const planoF = this.planoFilter(scope);

      // Contagens totais
      const [
        anomaliasTotal,
        ordensServicoTotal,
        equipamentosTotal,
        tarefasTotal,
        planosManutencaoTotal,
      ] = await Promise.all([
        this.prisma.anomalias.count({ where: { deleted_at: null, ...anomF } }),
        this.prisma.ordens_servico.count({ where: { deletado_em: null, ...osF } }),
        this.prisma.equipamentos.count({ where: { deleted_at: null, ...eqF } }),
        this.prisma.tarefas.count({ where: { deleted_at: null, ...tarefaF } }),
        this.prisma.planos_manutencao.count({ where: { deleted_at: null, ...planoF } }),
      ]);

      // Status derivados
      const [
        anomaliasAbertas,
        anomaliasResolvidas,
        osEmExecucao,
        osConcluidas,
        osCanceladas,
        tarefasAtivas,
        equipamentosCriticos,
        proximasManutencoes,
      ] = await Promise.all([
        this.prisma.anomalias.count({
          where: { deleted_at: null, status: { in: ['REGISTRADA', 'PROGRAMADA'] }, ...anomF },
        }),
        this.prisma.anomalias.count({
          where: { deleted_at: null, status: 'FINALIZADA', ...anomF },
        }),
        this.prisma.ordens_servico.count({
          where: { deletado_em: null, status: 'EM_EXECUCAO', ...osF },
        }),
        this.prisma.ordens_servico.count({
          where: { deletado_em: null, status: 'FINALIZADA', ...osF },
        }),
        this.prisma.ordens_servico.count({
          where: { deletado_em: null, status: 'CANCELADA', ...osF },
        }),
        this.prisma.tarefas.count({
          where: { deleted_at: null, status: 'ATIVA', ...tarefaF },
        }),
        this.prisma.equipamentos.findMany({
          where: { deleted_at: null, ...eqF },
          take: 5,
          orderBy: { created_at: 'desc' },
          select: { id: true, nome: true, status: true, criticidade: true },
        }),
        this.prisma.planos_manutencao.findMany({
          where: { deleted_at: null, ativo: true, ...planoF },
          take: 5,
          orderBy: { created_at: 'asc' },
          select: {
            id: true,
            nome: true,
            equipamento: { select: { nome: true } },
          },
        }),
      ]);

      const osAbertas = Math.max(ordensServicoTotal - osEmExecucao - osConcluidas - osCanceladas, 0);

      const disponibilidade = equipamentosTotal > 0
        ? ((equipamentosTotal - anomaliasAbertas) / equipamentosTotal) * 100
        : 0;

      const taxaResolucao = anomaliasTotal > 0
        ? (anomaliasResolvidas / anomaliasTotal) * 100
        : 0;

      return {
        metrics: {
          // TODO: calcular MTBF/MTTR/custo a partir de historico real;
          // por enquanto zerados para nao exibir dados ficticios.
          mtbf: 0,
          mttr: 0,
          disponibilidade: Math.round(disponibilidade),
          taxaResolucao: Math.round(taxaResolucao),
          eficienciaManutencao: 0,
          custoMedioManutencao: 0,
          tempoMedioResolucao: 0,
          saudeOperacional: Math.round((disponibilidade + taxaResolucao) / 2),
        },
        anomalias: {
          total: anomaliasTotal,
          abertas: anomaliasAbertas,
          emAndamento: Math.max(anomaliasTotal - anomaliasAbertas - anomaliasResolvidas, 0),
          resolvidas: anomaliasResolvidas,
          porTipo: [],
          tendenciaUltimos30Dias: [],
        },
        ordensServico: {
          total: ordensServicoTotal,
          abertas: osAbertas,
          emExecucao: osEmExecucao,
          concluidas: osConcluidas,
          canceladas: osCanceladas,
          porStatus: [],
          porPrioridade: {},
        },
        manutencoes: {
          totalRealizadas: planosManutencaoTotal,
          preventivas: 0,
          corretivas: 0,
          emergenciais: 0,
          porMes: [],
          custoTotal: 0,
        },
        equipamentosCriticos: equipamentosCriticos.map((eq) => ({
          id: eq.id,
          nome: eq.nome,
          codigo: '',
          numeroAnomalias: 0,
          numeroManutencoes: 0,
          tempoInativo: 0,
          criticidade: (eq.criticidade as any) || 'MEDIA',
          ultimaManutencao: undefined,
          proximaManutencao: undefined,
        })),
        proximasManutencoes: proximasManutencoes.map((pm) => ({
          id: pm.id,
          nome: pm.nome,
          equipamento: pm.equipamento?.nome || 'Sem equipamento',
          dataProximaExecucao: '',
          diasRestantes: 0,
          prioridade: 'MEDIA' as any,
        })),
        tendencias: [],
        reservas: {
          total: 0,
          emAndamento: 0,
          finalizadas: 0,
          canceladas: 0,
          taxaUtilizacao: 0,
        },
        tarefas: {
          total: tarefasTotal,
          pendentes: Math.max(tarefasTotal - tarefasAtivas, 0),
          emAndamento: tarefasAtivas,
          concluidas: 0,
          atrasadas: 0,
          taxaConclusao: tarefasTotal > 0 ? Math.round((tarefasAtivas / tarefasTotal) * 100) : 0,
        },
        ultimaAtualizacao: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Erro ao buscar dados do dashboard:', error);
      return this.emptyPayload();
    }
  }

  private emptyPayload() {
    return {
      metrics: {
        mtbf: 0, mttr: 0, disponibilidade: 0, taxaResolucao: 0,
        eficienciaManutencao: 0, custoMedioManutencao: 0,
        tempoMedioResolucao: 0, saudeOperacional: 0,
      },
      anomalias: { total: 0, abertas: 0, emAndamento: 0, resolvidas: 0, porTipo: [], tendenciaUltimos30Dias: [] },
      ordensServico: { total: 0, abertas: 0, emExecucao: 0, concluidas: 0, canceladas: 0, porStatus: [], porPrioridade: {} },
      manutencoes: { totalRealizadas: 0, preventivas: 0, corretivas: 0, emergenciais: 0, porMes: [], custoTotal: 0 },
      equipamentosCriticos: [],
      proximasManutencoes: [],
      tendencias: [],
      reservas: { total: 0, emAndamento: 0, finalizadas: 0, canceladas: 0, taxaUtilizacao: 0 },
      tarefas: { total: 0, pendentes: 0, emAndamento: 0, concluidas: 0, atrasadas: 0, taxaConclusao: 0 },
      ultimaAtualizacao: new Date().toISOString(),
    };
  }
}
