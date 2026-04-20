// src/modules/tarefas/tarefas-scheduler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@aupus/api-shared';
import { ProgramacaoOSService } from '../programacao-os/programacao-os.service';

/** Mapa frequência → dias */
const FREQUENCIA_DIAS: Record<string, number> = {
  DIARIA: 1,
  SEMANAL: 7,
  QUINZENAL: 15,
  MENSAL: 30,
  BIMESTRAL: 60,
  TRIMESTRAL: 90,
  SEMESTRAL: 180,
  ANUAL: 365,
};

/** Mapa criticidade equipamento (A/B/C) → prioridade OS */
const CRITICIDADE_PRIORIDADE: Record<string, string> = {
  A: 'ALTA',
  B: 'MEDIA',
  C: 'BAIXA',
};

/** Janela de agrupamento em dias */
const JANELA_AGRUPAMENTO_DIAS = 14;

/** Horizonte de antecedência em dias */
const HORIZONTE_DIAS = 60;

interface TarefaElegivel {
  id: string;
  nome: string;
  tag: string;
  tipo_manutencao: string;
  frequencia: string | null;
  frequencia_personalizada: number | null;
  data_ultima_execucao: Date | null;
  created_at: Date;
  tempo_estimado: number;
  duracao_estimada: any;
  equipamento_id: string;
  equipamento: {
    id: string;
    nome: string;
    criticidade: string;
    unidade_id: string | null;
    unidade: {
      id: string;
      nome: string;
    } | null;
  };
  proxima_execucao?: Date;
}

@Injectable()
export class TarefasSchedulerService {
  private readonly logger = new Logger(TarefasSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly programacaoOSService: ProgramacaoOSService,
  ) {}

  /**
   * Cron: todo dia às 3h da manhã
   */
  @Cron('0 3 * * *')
  async handleCron(): Promise<void> {
    this.logger.log('Iniciando geração automática de programações a partir de tarefas...');
    try {
      const resultado = await this.gerarProgramacoesAutomaticas();
      this.logger.log(
        `Geração automática concluída: ${resultado.programacoesCriadas} programações criadas, ${resultado.tarefasProcessadas} tarefas processadas, ${resultado.tarefasIgnoradas} tarefas já com programação ativa`,
      );
    } catch (error) {
      this.logger.error(`Erro na geração automática de programações: ${error.message}`, error.stack);
    }
  }

  /**
   * Método principal - pode ser chamado via cron ou endpoint manual
   */
  async gerarProgramacoesAutomaticas(): Promise<{
    programacoesCriadas: number;
    tarefasProcessadas: number;
    tarefasIgnoradas: number;
    detalhes: Array<{ programacaoId: string; codigo: string; unidade: string; tarefas: number }>;
  }> {
    // 1. Buscar tarefas elegíveis
    const tarefas = await this.buscarTarefasElegiveis();
    this.logger.log(`Encontradas ${tarefas.length} tarefas ativas com frequência definida`);

    // 2. Calcular próxima execução e filtrar por horizonte
    const hoje = new Date();
    const limiteHorizonte = new Date(hoje.getTime() + HORIZONTE_DIAS * 24 * 60 * 60 * 1000);

    const tarefasDentroHorizonte = tarefas
      .map((t) => ({
        ...t,
        proxima_execucao: this.calcularProximaExecucao(t),
      }))
      .filter((t) => t.proxima_execucao && t.proxima_execucao <= limiteHorizonte);

    this.logger.log(`${tarefasDentroHorizonte.length} tarefas vencem nos próximos ${HORIZONTE_DIAS} dias`);

    // 3. Filtrar tarefas que já têm programação ativa
    const tarefasSemProgramacao = await this.filtrarSemProgramacaoAtiva(tarefasDentroHorizonte);
    const tarefasIgnoradas = tarefasDentroHorizonte.length - tarefasSemProgramacao.length;
    this.logger.log(`${tarefasSemProgramacao.length} tarefas sem programação ativa (${tarefasIgnoradas} já possuem)`);

    if (tarefasSemProgramacao.length === 0) {
      return { programacoesCriadas: 0, tarefasProcessadas: 0, tarefasIgnoradas, detalhes: [] };
    }

    // 4. Agrupar por unidade
    const gruposPorUnidade = this.agruparPorUnidade(tarefasSemProgramacao);

    // 5. Dentro de cada unidade, agrupar por janela de data
    const detalhes: Array<{ programacaoId: string; codigo: string; unidade: string; tarefas: number }> = [];
    let totalTarefasProcessadas = 0;

    for (const [unidadeId, tarefasUnidade] of gruposPorUnidade.entries()) {
      const clusters = this.agruparPorJanelaData(tarefasUnidade);
      const nomeUnidade = tarefasUnidade[0]?.equipamento?.unidade?.nome || 'Sem unidade';

      for (const cluster of clusters) {
        try {
          const resultado = await this.criarProgramacaoParaCluster(cluster, nomeUnidade, unidadeId);
          if (resultado) {
            detalhes.push({
              programacaoId: resultado.id,
              codigo: resultado.codigo,
              unidade: nomeUnidade,
              tarefas: cluster.length,
            });
            totalTarefasProcessadas += cluster.length;
          }
        } catch (error) {
          this.logger.error(
            `Erro ao criar programação para unidade ${nomeUnidade} com ${cluster.length} tarefas: ${error.message}`,
          );
        }
      }
    }

    return {
      programacoesCriadas: detalhes.length,
      tarefasProcessadas: totalTarefasProcessadas,
      tarefasIgnoradas,
      detalhes,
    };
  }

  /**
   * Busca tarefas ATIVAS de planos ATIVOS com frequência definida
   */
  private async buscarTarefasElegiveis(): Promise<TarefaElegivel[]> {
    const tarefas = await this.prisma.tarefas.findMany({
      where: {
        status: 'ATIVA',
        deleted_at: null,
        frequencia: { not: null },
        // Plano ativo (ou tarefa sem plano - independente)
        OR: [
          {
            plano_manutencao: {
              status: 'ATIVO',
              ativo: true,
            },
          },
          {
            plano_manutencao_id: null,
          },
        ],
      },
      include: {
        equipamento: {
          select: {
            id: true,
            nome: true,
            criticidade: true,
            unidade_id: true,
            unidade: {
              select: {
                id: true,
                nome: true,
              },
            },
          },
        },
      },
    });

    return tarefas as any as TarefaElegivel[];
  }

  /**
   * Calcula a data da próxima execução com base na frequência
   */
  private calcularProximaExecucao(tarefa: TarefaElegivel): Date | null {
    const freq = tarefa.frequencia;
    if (!freq) return null;

    let diasIntervalo: number;

    if (freq === 'PERSONALIZADA') {
      if (!tarefa.frequencia_personalizada) return null;
      diasIntervalo = tarefa.frequencia_personalizada;
    } else {
      diasIntervalo = FREQUENCIA_DIAS[freq];
      if (!diasIntervalo) return null;
    }

    // Base: última execução ou data de criação da tarefa
    const baseDate = tarefa.data_ultima_execucao
      ? new Date(tarefa.data_ultima_execucao)
      : new Date(tarefa.created_at);

    const proxima = new Date(baseDate.getTime() + diasIntervalo * 24 * 60 * 60 * 1000);
    return proxima;
  }

  /**
   * Filtra tarefas que NÃO têm programação ativa (PENDENTE, APROVADA, EM_EXECUCAO)
   */
  private async filtrarSemProgramacaoAtiva(tarefas: TarefaElegivel[]): Promise<TarefaElegivel[]> {
    if (tarefas.length === 0) return [];

    const tarefaIds = tarefas.map((t) => t.id);

    // Buscar tarefas que JÁ estão vinculadas a programações ativas
    const vinculosProgramacao = await this.prisma.tarefas_programacao_os.findMany({
      where: {
        tarefa_id: { in: tarefaIds },
        programacao: {
          is: {
            status: { in: ['PENDENTE', 'APROVADA'] },
            deletado_em: null,
          },
        },
      },
      select: { tarefa_id: true },
    });

    // Buscar tarefas que JÁ estão vinculadas a OS ativas (não finalizada/cancelada)
    const vinculosOS = await this.prisma.tarefas_os.findMany({
      where: {
        tarefa_id: { in: tarefaIds },
        ordem_servico: {
          status: { in: ['PENDENTE', 'EM_EXECUCAO', 'PAUSADA', 'EXECUTADA', 'AUDITADA'] },
        },
      },
      select: { tarefa_id: true },
    });

    const idsComProgramacao = new Set([
      ...vinculosProgramacao.map((v) => v.tarefa_id?.trim()),
      ...vinculosOS.map((v) => v.tarefa_id?.trim()),
    ]);

    return tarefas.filter((t) => !idsComProgramacao.has(t.id.trim()));
  }

  /**
   * Agrupa tarefas por unidade_id do equipamento
   */
  private agruparPorUnidade(tarefas: TarefaElegivel[]): Map<string, TarefaElegivel[]> {
    const grupos = new Map<string, TarefaElegivel[]>();

    for (const tarefa of tarefas) {
      const unidadeId = tarefa.equipamento?.unidade_id || 'sem_unidade';
      if (!grupos.has(unidadeId)) {
        grupos.set(unidadeId, []);
      }
      grupos.get(unidadeId)!.push(tarefa);
    }

    return grupos;
  }

  /**
   * Dentro de uma unidade, agrupa tarefas em clusters de ±14 dias
   */
  private agruparPorJanelaData(tarefas: TarefaElegivel[]): TarefaElegivel[][] {
    // Ordenar por próxima execução
    const ordenadas = [...tarefas].sort(
      (a, b) => (a.proxima_execucao?.getTime() || 0) - (b.proxima_execucao?.getTime() || 0),
    );

    const clusters: TarefaElegivel[][] = [];
    let clusterAtual: TarefaElegivel[] = [];
    let dataInicioCluster: Date | null = null;

    const janelaMs = JANELA_AGRUPAMENTO_DIAS * 24 * 60 * 60 * 1000;

    for (const tarefa of ordenadas) {
      if (!tarefa.proxima_execucao) continue;

      if (clusterAtual.length === 0) {
        // Iniciar novo cluster
        clusterAtual.push(tarefa);
        dataInicioCluster = tarefa.proxima_execucao;
      } else if (
        dataInicioCluster &&
        tarefa.proxima_execucao.getTime() - dataInicioCluster.getTime() <= janelaMs
      ) {
        // Cabe no cluster atual
        clusterAtual.push(tarefa);
      } else {
        // Fechar cluster e iniciar novo
        clusters.push(clusterAtual);
        clusterAtual = [tarefa];
        dataInicioCluster = tarefa.proxima_execucao;
      }
    }

    if (clusterAtual.length > 0) {
      clusters.push(clusterAtual);
    }

    return clusters;
  }

  /**
   * Cria uma programação OS para um cluster de tarefas
   */
  private async criarProgramacaoParaCluster(
    cluster: TarefaElegivel[],
    nomeUnidade: string,
    unidadeId: string,
  ): Promise<{ id: string; codigo: string } | null> {
    if (cluster.length === 0) return null;

    // Data programada = data mais próxima do cluster
    const dataProgramada = cluster[0].proxima_execucao!;
    const mesAno = `${String(dataProgramada.getMonth() + 1).padStart(2, '0')}/${dataProgramada.getFullYear()}`;

    // Prioridade baseada na criticidade mais alta dos equipamentos
    const prioridade = this.determinarPrioridade(cluster);

    // Tipo: pega da primeira tarefa ou PREVENTIVA se mistas
    const tipos = [...new Set(cluster.map((t) => t.tipo_manutencao).filter(Boolean))];
    const tipo = tipos.length === 1 ? tipos[0] : 'PREVENTIVA';

    // Descrição padrão
    const descricao = `Manutenção preventiva programada - ${nomeUnidade} - ${mesAno}`;

    // Observações com tags das tarefas
    const tarefaTags = cluster.map((t) => t.tag).filter(Boolean);
    const observacoes = `Gerada automaticamente pelo sistema. Tarefas: ${tarefaTags.join(', ')}`;

    const tarefaIds = cluster.map((t) => t.id);

    // Equipamento único?
    const equipamentosUnicos = [...new Set(cluster.map((t) => t.equipamento_id))];

    const resultado = await this.programacaoOSService.criarDeTarefas(
      {
        tarefas_ids: tarefaIds,
        descricao,
        prioridade,
        data_hora_programada: dataProgramada.toISOString(),
        observacoes,
        agrupar_por: 'planta',
      },
      undefined, // usuarioId - sistema
    );

    // Atualizar dados_origem com info extra da geração automática
    if (resultado?.id) {
      try {
        const dadosOrigemAtual = (resultado as any).dados_origem || {};
        await this.prisma.programacoes_os.update({
          where: { id: resultado.id },
          data: {
            dados_origem: {
              ...dadosOrigemAtual,
              auto_gerada: true,
              tarefas_ids: tarefaIds,
              tarefas_tags: tarefaTags,
              unidade_id: unidadeId,
              unidade_nome: nomeUnidade,
              janela_inicio: cluster[0].proxima_execucao?.toISOString(),
              janela_fim: cluster[cluster.length - 1].proxima_execucao?.toISOString(),
            },
          },
        });
      } catch (error) {
        this.logger.warn(`Erro ao atualizar dados_origem: ${error.message}`);
      }
    }

    this.logger.log(
      `Programação ${resultado.codigo} criada para ${nomeUnidade} com ${cluster.length} tarefas (${mesAno})`,
    );

    return { id: resultado.id, codigo: resultado.codigo };
  }

  /**
   * Determina prioridade baseada na criticidade mais alta dos equipamentos do cluster
   */
  private determinarPrioridade(cluster: TarefaElegivel[]): string {
    const criticidades = cluster.map((t) => t.equipamento?.criticidade).filter(Boolean);

    // A = mais crítico, C = menos
    if (criticidades.includes('A')) return 'ALTA';
    if (criticidades.includes('B')) return 'MEDIA';
    if (criticidades.includes('C')) return 'BAIXA';

    return 'MEDIA';
  }
}
