// src/modules/tarefas/tarefas-scheduler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@aupus/api-shared';
import { ProgramacaoOSService } from '../programacao-os/programacao-os.service';
import { calcularProximaExecucao } from './periodicidade';
import { variantesDeIds } from './ids';


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
  data_ancora: Date | null;
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

    // Ultima execucao efetiva vem do historico de OS, nao do campo cache
    const ultimasExecucoes = await this.buscarUltimasExecucoes(tarefas.map((t) => t.id.trim()));

    const tarefasDentroHorizonte = tarefas
      .map((t) => ({
        ...t,
        proxima_execucao: this.calcularProximaExecucao(t, ultimasExecucoes.get(t.id.trim())),
      }))
      .filter((t) => t.proxima_execucao && t.proxima_execucao <= limiteHorizonte);

    this.logger.log(`${tarefasDentroHorizonte.length} tarefas vencem nos próximos ${HORIZONTE_DIAS} dias`);

    // 3. Descartar as que ja tem item aberto para o ciclo atual
    const tarefasSemProgramacao = await this.filtrarCiclosJaGerados(tarefasDentroHorizonte);
    const tarefasIgnoradas = tarefasDentroHorizonte.length - tarefasSemProgramacao.length;
    this.logger.log(
      `${tarefasSemProgramacao.length} tarefas com ciclo em aberto para gerar (${tarefasIgnoradas} ja possuem item no ciclo)`,
    );

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
        deleted_at: null,
        ativo: true,
        frequencia: { not: null },
        // Tarefa de template nao gera OS: ela nao tem equipamento e serve
        // apenas de molde para as copias.
        equipamento_id: { not: null },
        // Removida localmente: o usuario tirou a tarefa daquele equipamento.
        origem_status: { not: 'REMOVIDA' },
        // So copias vinculadas a equipamento. Tarefa avulsa (sem plano) segue
        // valendo — e o caso da tarefa criada direto no equipamento.
        OR: [
          { plano_manutencao: { plano_origem_id: { not: null }, ativo: true } },
          { plano_manutencao_id: null },
        ],
      },
      include: {
        // A duracao vem da instrucao: a tarefa nao guarda mais esse dado.
        instrucao: {
          select: { tempo_estimado: true, duracao_estimada: true },
        },
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
   * Ultima execucao EFETIVA por tarefa, lida do historico de OS.
   *
   * O campo `tarefas.data_ultima_execucao` e cache: ele e escrito na
   * finalizacao da OS e pode ficar defasado se algo falhar no caminho. A fonte
   * da verdade e `tarefas_os.data_conclusao` das tarefas que foram realmente
   * concluidas em OS finalizadas — tarefa pendente ou cancelada dentro de uma
   * OS finalizada nao conta como executada.
   *
   * Uma query agregada para todas as tarefas, sem N+1.
   */
  private async buscarUltimasExecucoes(tarefaIds: string[]): Promise<Map<string, Date>> {
    if (tarefaIds.length === 0) return new Map();

    const vinculos = await this.prisma.tarefas_os.findMany({
      where: {
        // As duas formas do id: Char(26) e blank-padded, o id da tarefa tem 25.
        // Sem isto o cron nao enxergava execucao nenhuma e tratava toda tarefa
        // antiga como se nunca tivesse rodado.
        tarefa_id: { in: variantesDeIds(tarefaIds) },
        status: 'CONCLUIDA',
        data_conclusao: { not: null },
        ordem_servico: { status: 'FINALIZADA' },
      },
      select: { tarefa_id: true, data_conclusao: true },
    });

    const ultimas = new Map<string, Date>();
    for (const vinculo of vinculos) {
      const id = vinculo.tarefa_id?.trim();
      if (!id || !vinculo.data_conclusao) continue;

      const atual = ultimas.get(id);
      if (!atual || vinculo.data_conclusao > atual) {
        ultimas.set(id, vinculo.data_conclusao);
      }
    }

    return ultimas;
  }

  /**
   * Calcula a data da próxima execução com base na frequência
   */


  /**
   * Proxima execucao = ultima execucao efetiva + intervalo.
   *
   * Quando nunca houve execucao, a base e `data_ancora` (definida no vinculo do
   * plano ao equipamento). O fallback para `created_at` continua existindo para
   * tarefas antigas sem ancora, mas e ruim de proposito visivel: uma tarefa
   * anual criada hoje so apareceria daqui a um ano, que era o comportamento
   * anterior para todas.
   */
  private calcularProximaExecucao(tarefa: TarefaElegivel, ultimaExecucao?: Date): Date | null {
    return calcularProximaExecucao(tarefa, ultimaExecucao);
  }

  private chaveCiclo(tarefaId: string, ciclo?: Date | null): string {
    return `${tarefaId}|${ciclo ? ciclo.getTime() : 'sem-ciclo'}`;
  }

  /**
   * Descarta as tarefas cujo ciclo atual ja tem item ABERTO.
   *
   * A pergunta antiga era "essa tarefa tem alguma OS ativa?", o que dava dois
   * problemas: OS cancelada liberava a tarefa na mesma hora e o cron recriava a
   * programacao toda madrugada; e tarefa nao concluida numa OS finalizada
   * sumia, porque quem a segurava era o campo de ultima execucao, escrito
   * indevidamente para todas.
   *
   * Agora o bloqueio e por ciclo e so vale enquanto ha item aberto. OS
   * finalizada ou cancelada nao bloqueia: quem move o ciclo adiante e a execucao
   * efetiva (finalizada) ou a ancora (cancelada). Tarefa que nao foi concluida
   * volta ao pool no MESMO ciclo, como atrasada — e assim que entra numa
   * programacao nova, esta fica PENDENTE e segura as geracoes seguintes.
   */
  private async filtrarCiclosJaGerados(tarefas: TarefaElegivel[]): Promise<TarefaElegivel[]> {
    if (tarefas.length === 0) return [];

    const tarefaIds = tarefas.map((t) => t.id.trim());

    const [vinculosProgramacao, vinculosOS] = await Promise.all([
      this.prisma.tarefas_programacao_os.findMany({
        where: {
          tarefa_id: { in: variantesDeIds(tarefaIds) },
          programacao: {
            is: {
              status: { in: ['PENDENTE', 'APROVADA'] },
              deletado_em: null,
            },
          },
        },
        select: { tarefa_id: true, ciclo_referencia: true },
      }),
      this.prisma.tarefas_os.findMany({
        where: {
          tarefa_id: { in: variantesDeIds(tarefaIds) },
          ordem_servico: {
            status: { in: ['PENDENTE', 'EM_EXECUCAO', 'PAUSADA', 'EXECUTADA', 'AUDITADA'] },
          },
        },
        select: { tarefa_id: true, ciclo_referencia: true },
      }),
    ]);

    const ciclosAbertos = new Set<string>();
    for (const vinculo of [...vinculosProgramacao, ...vinculosOS]) {
      const id = vinculo.tarefa_id?.trim();
      if (!id) continue;
      ciclosAbertos.add(this.chaveCiclo(id, vinculo.ciclo_referencia));
    }

    return tarefas.filter((tarefa) => {
      const id = tarefa.id.trim();

      // Vinculos anteriores a esta versao nao tem ciclo gravado. Nesses casos
      // vale o comportamento antigo: bloqueia a tarefa inteira, em vez de
      // arriscar gerar programacao duplicada.
      if (ciclosAbertos.has(this.chaveCiclo(id, null))) return false;

      return !ciclosAbertos.has(this.chaveCiclo(id, tarefa.proxima_execucao));
    });
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

    // Marcar o ciclo de cada tarefa no vinculo recem-criado. E o que impede o
    // cron de gerar a mesma coisa de novo amanha, e o que a OS carrega adiante.
    if (resultado?.id) {
      for (const tarefa of cluster) {
        if (!tarefa.proxima_execucao) continue;
        try {
          await this.prisma.tarefas_programacao_os.updateMany({
            where: { programacao_id: resultado.id, tarefa_id: tarefa.id },
            data: { ciclo_referencia: tarefa.proxima_execucao },
          });
        } catch (error) {
          this.logger.warn(
            `Falha ao marcar ciclo de referencia da tarefa ${tarefa.id}: ${error.message}`,
          );
        }
      }
    }

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
