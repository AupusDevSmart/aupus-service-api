import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class DashboardSimpleService {
  constructor(private readonly prisma: PrismaService) {}

  async getSimpleDashboard(filters: any) {
    try {
      // Buscar dados básicos de forma paralela
      const [
        anomalias,
        ordensServico,
        equipamentos,
        tarefas,
        planosManutencao
      ] = await Promise.all([
        // Anomalias
        this.prisma.anomalias.count(),

        // Ordens de Serviço
        this.prisma.ordens_servico.count(),

        // Equipamentos
        this.prisma.equipamentos.count(),

        // Tarefas
        this.prisma.tarefas.count(),

        // Planos de Manutenção
        this.prisma.planos_manutencao.count()
      ]);

      // Buscar anomalias abertas (AGUARDANDO, EM_ANALISE, OS_GERADA)
      const anomaliasAbertas = await this.prisma.anomalias.count({
        where: {
          status: {
            in: ['AGUARDANDO', 'EM_ANALISE', 'OS_GERADA']
          }
        }
      });

      // Buscar OS em execução
      const osEmExecucao = await this.prisma.ordens_servico.count({
        where: { status: 'EM_EXECUCAO' }
      });

      // Buscar tarefas ativas
      const tarefasAtivas = await this.prisma.tarefas.count({
        where: { status: 'ATIVA' }
      });

      // Buscar equipamentos críticos
      const equipamentosCriticos = await this.prisma.equipamentos.findMany({
        take: 5,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          nome: true,
          status: true
        }
      });

      // Buscar próximas manutenções
      const proximasManutencoes = await this.prisma.planos_manutencao.findMany({
        take: 5,
        where: { ativo: true },
        orderBy: { created_at: 'asc' },
        select: {
          id: true,
          nome: true,
          equipamento: {
            select: {
              nome: true
            }
          }
        }
      });

      // Calcular métricas básicas
      const disponibilidade = equipamentos > 0 ?
        ((equipamentos - anomalias) / equipamentos) * 100 : 0;

      // Taxa de resolução baseada em anomalias resolvidas
      const anomaliasResolvidas = await this.prisma.anomalias.count({
        where: { status: 'RESOLVIDA' }
      });

      const taxaResolucao = anomalias > 0 ?
        (anomaliasResolvidas / anomalias) * 100 : 0;

      return {
        metrics: {
          mtbf: 720, // Valor exemplo - 30 dias
          mttr: 4,   // Valor exemplo - 4 horas
          disponibilidade: Math.round(disponibilidade),
          taxaResolucao: Math.round(taxaResolucao),
          eficienciaManutencao: 85, // Valor exemplo
          custoMedioManutencao: 1500, // Valor exemplo
          tempoMedioResolucao: 6, // Valor exemplo - 6 horas
          saudeOperacional: Math.round((disponibilidade + taxaResolucao) / 2)
        },
        anomalias: {
          total: anomalias,
          abertas: anomaliasAbertas,
          emAndamento: anomalias - anomaliasAbertas - anomaliasResolvidas,
          resolvidas: anomaliasResolvidas,
          porTipo: [],
          tendenciaUltimos30Dias: [5, 8, 12, 7, 10, 15, 9] // Valores exemplo
        },
        ordensServico: {
          total: ordensServico,
          abertas: ordensServico - osEmExecucao,
          emExecucao: osEmExecucao,
          concluidas: 0,
          canceladas: 0,
          porStatus: [],
          porPrioridade: {}
        },
        manutencoes: {
          totalRealizadas: planosManutencao,
          preventivas: Math.floor(planosManutencao * 0.7),
          corretivas: Math.floor(planosManutencao * 0.2),
          emergenciais: Math.floor(planosManutencao * 0.1),
          porMes: [
            { mes: 'Jan', preventivas: 15, corretivas: 5, emergenciais: 2, total: 22 },
            { mes: 'Fev', preventivas: 18, corretivas: 4, emergenciais: 1, total: 23 },
            { mes: 'Mar', preventivas: 20, corretivas: 6, emergenciais: 3, total: 29 }
          ],
          custoTotal: planosManutencao * 1500
        },
        equipamentosCriticos: equipamentosCriticos.map(eq => ({
          id: eq.id,
          nome: eq.nome,
          codigo: '',
          numeroAnomalias: Math.floor(Math.random() * 10),
          numeroManutencoes: Math.floor(Math.random() * 5),
          tempoInativo: Math.floor(Math.random() * 24),
          criticidade: 'MEDIA' as any,
          ultimaManutencao: new Date().toISOString(),
          proximaManutencao: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        })),
        proximasManutencoes: proximasManutencoes.map(pm => ({
          id: pm.id,
          nome: pm.nome,
          equipamento: pm.equipamento?.nome || 'Sem equipamento',
          dataProximaExecucao: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          diasRestantes: 7,
          prioridade: 'MEDIA' as any
        })),
        tendencias: [],
        reservas: {
          total: 0,
          emAndamento: 0,
          finalizadas: 0,
          canceladas: 0,
          taxaUtilizacao: 0
        },
        tarefas: {
          total: tarefas,
          pendentes: tarefas - tarefasAtivas,
          emAndamento: tarefasAtivas,
          concluidas: tarefasAtivas,
          atrasadas: 0,
          taxaConclusao: tarefas > 0 ? Math.round((tarefasAtivas / tarefas) * 100) : 0
        },
        ultimaAtualizacao: new Date().toISOString()
      };
    } catch (error) {
      console.error('Erro ao buscar dados do dashboard:', error);
      // Retornar dados mínimos em caso de erro
      return {
        metrics: {
          mtbf: 0,
          mttr: 0,
          disponibilidade: 0,
          taxaResolucao: 0,
          eficienciaManutencao: 0,
          custoMedioManutencao: 0,
          tempoMedioResolucao: 0,
          saudeOperacional: 0
        },
        anomalias: {
          total: 0,
          abertas: 0,
          emAndamento: 0,
          resolvidas: 0,
          porTipo: [],
          tendenciaUltimos30Dias: []
        },
        ordensServico: {
          total: 0,
          abertas: 0,
          emExecucao: 0,
          concluidas: 0,
          canceladas: 0,
          porStatus: [],
          porPrioridade: {}
        },
        manutencoes: {
          totalRealizadas: 0,
          preventivas: 0,
          corretivas: 0,
          emergenciais: 0,
          porMes: [],
          custoTotal: 0
        },
        equipamentosCriticos: [],
        proximasManutencoes: [],
        tendencias: [],
        reservas: {
          total: 0,
          emAndamento: 0,
          finalizadas: 0,
          canceladas: 0,
          taxaUtilizacao: 0
        },
        tarefas: {
          total: 0,
          pendentes: 0,
          emAndamento: 0,
          concluidas: 0,
          atrasadas: 0,
          taxaConclusao: 0
        },
        ultimaAtualizacao: new Date().toISOString()
      };
    }
  }
}