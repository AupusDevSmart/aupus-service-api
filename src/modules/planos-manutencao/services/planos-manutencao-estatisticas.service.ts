// src/modules/planos-manutencao/services/planos-manutencao-estatisticas.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@aupus/api-shared';
import { PlanoResumoDto, DashboardPlanosDto } from '../dto';
import { contarPorStatus, contarPorTipo } from '../helpers/planos-manutencao.helpers';
import { StatusPlano } from '@aupus/api-shared';

@Injectable()
export class PlanosManutencaoEstatisticasService {
  constructor(private readonly prisma: PrismaService) {}

  async obterResumo(id: string): Promise<PlanoResumoDto> {
    const plano = await this.prisma.planos_manutencao.findFirst({
      where: {
        id,
        deleted_at: null
      },
      include: {
        equipamento: {
          include: {
            unidade: {
              select: {
                planta: {
                  select: {
                    id: true,
                    nome: true
                  }
                }
              }
            }
          }
        },
        tarefas: {
          where: { deleted_at: null },
          include: {
            _count: {
              select: {
                sub_tarefas: true
              }
            }
          }
        }
      }
    });

    if (!plano) {
      throw new NotFoundException('Plano de manutenção não encontrado');
    }

    // Calcular estatísticas
    const totalTarefas = plano.tarefas.length;
    const tarefasAtivas = plano.tarefas.filter(t => t.ativo).length;
    const tarefasEmRevisao = plano.tarefas.filter(t => !t.ativo).length;

    const tarefasPreventivas = plano.tarefas.filter(t => t.tipo_manutencao === 'PREVENTIVA').length;
    const tarefasPreditivas = plano.tarefas.filter(t => t.tipo_manutencao === 'PREDITIVA').length;
    const tarefasCorretivas = plano.tarefas.filter(t => t.tipo_manutencao === 'CORRETIVA').length;

    const tempoTotalEstimado = plano.tarefas.reduce(
      (total, tarefa) => total + (tarefa.tempo_estimado || 0),
      0
    );

    const resumo: PlanoResumoDto = {
      id: plano.id,
      nome: plano.nome,
      versao: plano.versao,
      status: plano.status,
      equipamento_nome: plano.equipamento?.nome,
      equipamento_tipo: plano.equipamento?.tipo_equipamento,
      planta_nome: plano.equipamento?.unidade?.planta?.nome,
      total_tarefas: totalTarefas,
      tarefas_ativas: tarefasAtivas,
      tarefas_em_revisao: tarefasEmRevisao,
      tempo_total_estimado: tempoTotalEstimado,
      tarefas_preventivas: tarefasPreventivas,
      tarefas_preditivas: tarefasPreditivas,
      tarefas_corretivas: tarefasCorretivas,
      created_at: plano.created_at,
      updated_at: plano.updated_at
    };

    return resumo;
  }

  async obterDashboard(): Promise<DashboardPlanosDto> {
    const [statsPlanos, statsTarefas, distribuicao] = await Promise.all([
      // Stats dos planos
      this.prisma.planos_manutencao.groupBy({
        by: ['status'],
        where: { deleted_at: null },
        _count: true
      }),

      // Stats das tarefas
      this.prisma.tarefas.aggregate({
        where: { deleted_at: null },
        _count: true,
        _avg: { tempo_estimado: true }
      }),

      // Distribuição por tipo
      this.prisma.tarefas.groupBy({
        by: ['tipo_manutencao'],
        where: {
          deleted_at: null,
          ativo: true
        },
        _count: true
      })
    ]);

    const totalPlanos = statsPlanos.reduce((acc, stat) => acc + stat._count, 0);
    const equipamentosComPlano = await this.prisma.planos_manutencao
      .groupBy({
        by: ['equipamento_id'],
        where: { deleted_at: null }
      })
      .then(result => result.length);

    const mediaTempoTotal = await this.prisma.$queryRaw<[{ avg: number }]>`
      SELECT AVG(tempo_total) as avg
      FROM (
        SELECT SUM(t.tempo_estimado) as tempo_total
        FROM tarefas t
        WHERE t.deleted_at IS NULL AND t.ativo = true
        GROUP BY t.plano_manutencao_id
      ) subquery
    `;

    return {
      total_planos: totalPlanos,
      planos_ativos: contarPorStatus(statsPlanos, StatusPlano.ATIVO),
      planos_inativos: contarPorStatus(statsPlanos, StatusPlano.INATIVO),
      planos_em_revisao: contarPorStatus(statsPlanos, StatusPlano.EM_REVISAO),
      planos_arquivados: contarPorStatus(statsPlanos, StatusPlano.ARQUIVADO),
      equipamentos_com_plano: equipamentosComPlano,
      total_tarefas_todos_planos: statsTarefas._count,
      media_tarefas_por_plano:
        totalPlanos > 0 ? Math.round(statsTarefas._count / totalPlanos) : 0,
      tempo_total_estimado_geral: Math.round(mediaTempoTotal[0]?.avg || 0),
      distribuicao_tipos: {
        preventiva: contarPorTipo(distribuicao, 'PREVENTIVA'),
        preditiva: contarPorTipo(distribuicao, 'PREDITIVA'),
        corretiva: contarPorTipo(distribuicao, 'CORRETIVA'),
        inspecao: contarPorTipo(distribuicao, 'INSPECAO'),
        visita_tecnica: contarPorTipo(distribuicao, 'VISITA_TECNICA')
      }
    };
  }
}
