// src/modules/tarefas/tarefas-scheduler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, PrismaService } from '@/core';
import { ProgramacaoOSService } from '../programacao-os/programacao-os.service';
import { calcularProximaExecucao } from './periodicidade';
import {
  FUSO_DO_GERADOR,
  HORIZONTE_DIAS,
  buscarCiclosAbertos,
  buscarTarefasElegiveis,
  buscarUltimasExecucoes,
  cicloAberto,
  cicloNoSegundo,
  type TarefaElegivel,
} from './ciclos-das-tarefas';
import { PrioridadeDaPreventiva, prioridadePelaCriticidade } from './prioridade-pela-criticidade';
import { proximoDiaUtil, regraDeDiasUteis } from '../agenda/dias-uteis';
import { Sentry } from '../../config/sentry.config';

/** `dados_origem` e Json: so um objeto recebe as chaves da geracao automatica. */
function ehObjetoJson(valor: unknown): valor is Prisma.JsonObject {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** Janela de agrupamento em dias */
const JANELA_AGRUPAMENTO_DIAS = 14;

/** Grupo que o cron não conseguiu programar: aparece no retorno e no resumo. */
export interface FalhaDaGeracao {
  unidade: string;
  tarefas: string[];
  motivo: string;
}

@Injectable()
export class TarefasSchedulerService {
  private readonly logger = new Logger(TarefasSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly programacaoOSService: ProgramacaoOSService,
  ) {}

  /**
   * Cron: todo dia às 3h da manhã de Brasília. O fuso vai explícito: sem ele a
   * rodada seguia o fuso do servidor (UTC em produção, 0h de Brasília) e a
   * previsão da agenda não tinha como dizer o dia certo.
   */
  @Cron('0 3 * * *', { timeZone: FUSO_DO_GERADOR })
  async handleCron(): Promise<void> {
    this.logger.log('Iniciando geração automática de programações a partir de tarefas...');
    try {
      const resultado = await this.gerarProgramacoesAutomaticas();
      this.logger.log(
        `Geração automática concluída: ${resultado.programacoesCriadas} programações criadas, ${resultado.tarefasProcessadas} tarefas processadas, ${resultado.tarefasIgnoradas} tarefas já com programação ativa, ${resultado.falhas.length} grupo(s) com falha`,
      );
      // A falha se repete toda madrugada até alguém corrigir o cadastro: tem de
      // chegar a quem acompanha, não só ao log
      if (resultado.falhas.length > 0) {
        Sentry.captureMessage('Cron de preventivas: grupos sem programação', {
          level: 'warning',
          extra: { falhas: resultado.falhas },
        });
      }
    } catch (error) {
      this.logger.error(`Erro na geração automática de programações: ${error.message}`, error.stack);
    }
  }

  /**
   * Método principal - pode ser chamado via cron ou endpoint manual.
   * `agora` e `equipamentoIds` existem para o teste que confere a previsão da
   * agenda contra o gerador (SN-51): o cron e a rota manual não os passam.
   */
  async gerarProgramacoesAutomaticas(opcoes: { agora?: Date; equipamentoIds?: string[] } = {}): Promise<{
    programacoesCriadas: number;
    tarefasProcessadas: number;
    tarefasIgnoradas: number;
    detalhes: Array<{ programacaoId: string; codigo: string; unidade: string; tarefas: number }>;
    falhas: FalhaDaGeracao[];
  }> {
    // 1. Buscar tarefas elegíveis
    const tarefas = await buscarTarefasElegiveis(this.prisma, { equipamentoIds: opcoes.equipamentoIds });
    this.logger.log(`Encontradas ${tarefas.length} tarefas ativas com frequência definida`);

    // 2. Calcular próxima execução e filtrar por horizonte
    const hoje = opcoes.agora ?? new Date();
    const limiteHorizonte = new Date(hoje.getTime() + HORIZONTE_DIAS * 24 * 60 * 60 * 1000);

    // Ultima execucao efetiva vem do historico de OS, nao do campo cache
    const ultimasExecucoes = await buscarUltimasExecucoes(this.prisma, tarefas.map((t) => t.id.trim()));

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
      return { programacoesCriadas: 0, tarefasProcessadas: 0, tarefasIgnoradas, detalhes: [], falhas: [] };
    }

    const detalhes: Array<{ programacaoId: string; codigo: string; unidade: string; tarefas: number }> = [];
    const falhas: FalhaDaGeracao[] = [];
    let totalTarefasProcessadas = 0;

    // Toda programação tem planta (SN-35): tarefa de equipamento sem planta não
    // tem como sair. Fica de fora, nomeada, em vez de derrubar o grupo inteiro.
    const semPlanta = tarefasSemProgramacao.filter((t) => !t.planta_id);
    if (semPlanta.length > 0) {
      const falha = { unidade: 'Sem planta', tarefas: semPlanta.map((t) => t.tag), motivo: 'O equipamento da tarefa não está em nenhuma planta' };
      falhas.push(falha);
      this.logger.error(`${falha.motivo}: ${falha.tarefas.join(', ')}`);
    }

    // 4. Agrupar por unidade (e planta: uma programação atende uma planta só)
    const gruposPorUnidade = this.agruparPorUnidade(tarefasSemProgramacao.filter((t) => t.planta_id));

    // 5. Dentro de cada unidade, agrupar por janela de data

    for (const tarefasUnidade of gruposPorUnidade.values()) {
      const clusters = this.agruparPorJanelaData(tarefasUnidade);
      const nomeUnidade = tarefasUnidade[0]?.equipamento?.unidade?.nome || 'Sem unidade';
      // A chave do grupo leva a planta; o que se grava é a unidade
      const unidadeId = tarefasUnidade[0]?.equipamento?.unidade_id || 'sem_unidade';

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
          const falha = {
            unidade: nomeUnidade,
            tarefas: cluster.map((t) => t.tag),
            motivo: error instanceof Error ? error.message : String(error),
          };
          falhas.push(falha);
          this.logger.error(`Erro ao criar programação para unidade ${nomeUnidade} (${falha.tarefas.join(', ')}): ${falha.motivo}`);
        }
      }
    }

    return {
      programacoesCriadas: detalhes.length,
      tarefasProcessadas: totalTarefasProcessadas,
      tarefasIgnoradas,
      detalhes,
      falhas,
    };
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
    // No segundo: é como o ciclo fica gravado (ver cicloNoSegundo)
    const proxima = calcularProximaExecucao(tarefa, ultimaExecucao);
    return proxima ? cicloNoSegundo(proxima) : null;
  }

  /**
   * Descarta as tarefas cujo ciclo atual ja tem item ABERTO (regra em
   * ciclos-das-tarefas.ts, a mesma da previsão da agenda).
   *
   * A pergunta antiga era "essa tarefa tem alguma OS ativa?", o que dava dois
   * problemas: OS cancelada liberava a tarefa na mesma hora e o cron recriava a
   * programacao toda madrugada; e tarefa nao concluida numa OS finalizada
   * sumia, porque quem a segurava era o campo de ultima execucao, escrito
   * indevidamente para todas.
   */
  private async filtrarCiclosJaGerados(tarefas: TarefaElegivel[]): Promise<TarefaElegivel[]> {
    if (tarefas.length === 0) return [];
    const ciclos = await buscarCiclosAbertos(this.prisma, tarefas.map((t) => t.id.trim()));
    return tarefas.filter((tarefa) => !cicloAberto(ciclos, tarefa.id, tarefa.proxima_execucao));
  }

  /**
   * Agrupa tarefas por unidade_id do equipamento
   */
  private agruparPorUnidade(tarefas: TarefaElegivel[]): Map<string, TarefaElegivel[]> {
    const grupos = new Map<string, TarefaElegivel[]>();

    for (const tarefa of tarefas) {
      // A planta entra na chave: equipamento com planta própria diferente da da
      // unidade (ou sem unidade nenhuma) não se mistura com os outros
      const unidadeId = `${tarefa.equipamento?.unidade_id || 'sem_unidade'}|${tarefa.planta_id}`;
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

    // Data programada = data mais próxima do cluster, levada ao próximo dia útil
    // da planta (feriados e dias da semana da agenda). O ciclo de referência de
    // cada tarefa continua sendo a data prevista: é ele que o cron compara.
    const dataPrevista = cluster[0].proxima_execucao!;
    const plantaId = cluster[0].planta_id;
    const dataProgramada = proximoDiaUtil(dataPrevista, await regraDeDiasUteis(this.prisma, plantaId));
    const mesAno = `${String(dataProgramada.getMonth() + 1).padStart(2, '0')}/${dataProgramada.getFullYear()}`;

    // Prioridade pela criticidade mais alta (dos equipamentos e das tarefas)
    const prioridade = this.determinarPrioridade(cluster);

    // A tarefa não guarda mais o tipo (saiu no PR6 do plano por categoria):
    // o que o plano gera é preventiva.
    const tipo = 'PREVENTIVA';

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
        // Vínculo sem ciclo bloqueia a tarefa inteira (vale o comportamento
        // antigo) e o cancelamento não move a âncora: não pode passar calado
        try {
          const { count } = await this.prisma.tarefas_programacao_os.updateMany({
            where: { programacao_id: resultado.id, tarefa_id: tarefa.id },
            data: { ciclo_referencia: tarefa.proxima_execucao },
          });
          if (count === 0) this.logger.error(`Ciclo de referência não marcado: tarefa ${tarefa.id} sem vínculo na programação ${resultado.codigo}`);
        } catch (error) {
          this.logger.error(`Falha ao marcar ciclo de referencia da tarefa ${tarefa.id}: ${error.message}`);
        }
      }
    }

    // Atualizar dados_origem com info extra da geração automática
    if (resultado?.id) {
      try {
        const dadosOrigemAtual = ehObjetoJson(resultado.dados_origem) ? resultado.dados_origem : {};
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
              data_prevista: dataPrevista.toISOString(),
              ajustada_para_dia_util: dataProgramada.getTime() !== dataPrevista.getTime(),
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

  /** Prioridade pela criticidade mais alta do grupo — regra em prioridade-pela-criticidade.ts. */
  private determinarPrioridade(cluster: Pick<TarefaElegivel, 'criticidade' | 'equipamento'>[]): PrioridadeDaPreventiva {
    return prioridadePelaCriticidade(cluster.flatMap((t) => [t.equipamento?.criticidade, t.criticidade]));
  }
}
