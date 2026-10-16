import { BadRequestException, Injectable } from '@nestjs/common';
import { PermissionScopeService, PrismaService, type ScopedUser } from '@/core';
import { variantesDeIds } from '../../tarefas/ids';
import { calcularProximaExecucao, intervaloEmDias } from '../../tarefas/periodicidade';
import {
  HORIZONTE_DIAS,
  buscarCiclosAbertos,
  buscarTarefasElegiveis,
  buscarUltimasExecucoes,
  cicloAberto,
  cicloNoSegundo,
  proximaRodadaDoGerador,
  type ItemAberto,
  type TarefaElegivel,
} from '../../tarefas/ciclos-das-tarefas';
import { proximoDiaUtil, regrasDeDiasUteis, type RegraDeDiasUteis } from '../dias-uteis';

const DIA_MS = 86_400_000;
/** Mais que isto não cabe numa tela: a previsão recusa, em vez de cortar calada (estreitar o período ou filtrar). */
export const MAXIMO_DE_ITENS = 5_000;

/**
 * - `programado`: o ciclo já tem programação ou OS aberta (o gerador não cria outra);
 * - `atrasado`: venceu e ainda não tem — o gerador o programa na próxima rodada;
 * - `previsto`: vence no futuro; `programacao_a_partir_de` diz quando o gerador o programa;
 * - `nao_sai`: o gerador não consegue programar (o motivo vem junto) — hoje, equipamento sem planta.
 */
export type SituacaoDoCiclo = 'programado' | 'atrasado' | 'previsto' | 'nao_sai';

const SEM_PLANTA = 'O equipamento da tarefa não está em nenhuma planta: o gerador não programa (e avisa a cada rodada)';

export interface CicloPrevisto {
  tarefa_id: string;
  tarefa_tag: string;
  tarefa_nome: string;
  frequencia: string | null;
  equipamento_id: string;
  equipamento_nome: string;
  unidade_nome: string | null;
  planta_id: string | null;
  planta_nome: string | null;
  /** A data prevista: o `ciclo_referencia` que o gerador grava (no segundo). */
  ciclo: Date;
  /** Para quando sai: a data marcada no registro, se já há; senão o próximo dia útil da planta. */
  data_programada: Date;
  /**
   * A data é estimativa: o gerador junta tarefas da mesma instalação que vencem
   * em 14 dias e programa todas na data da primeira, e a pessoa pode remarcar.
   */
  data_programada_estimada: boolean;
  situacao: SituacaoDoCiclo;
  motivo: string | null;
  /** A rodada do gerador (3h de Brasília) que cria a programação deste ciclo; null se já existe ou não sai. */
  programacao_a_partir_de: Date | null;
  programacao_id: string | null;
  os_id: string | null;
  status_do_item: string | null;
}

export interface PrevisaoDaAgenda {
  inicio: Date;
  fim: Date;
  horizonte_dias: number;
  itens: CicloPrevisto[];
  /** Ciclos que já venceram ANTES do período e não estão programados (ou não saem): a tela avisa, não some com eles. */
  atrasados_antes: number;
}

const maior = (...datas: Date[]) => new Date(Math.max(...datas.map((d) => d.getTime())));

/**
 * A previsão dos ciclos de cada tarefa num período (SN-51), pela MESMA regra
 * do gerador: as consultas são as de ciclos-das-tarefas.ts e a conta é
 * `calcularProximaExecucao`, no segundo como o gerador grava.
 *
 * - O ciclo de agora parte da última execução real e da âncora: é exatamente o
 *   que o gerador vai olhar. Só ele pode estar atrasado ou já programado.
 * - Os seguintes supõem o anterior feito no dia em que vence — ou agora, se já
 *   venceu — e só saem depois dele: o gerador não cria o próximo antes de o
 *   anterior ser finalizado. São previsão; mudam quando a execução acontece.
 * Só tarefas das plantas que a pessoa enxerga, filtradas na consulta.
 */
@Injectable()
export class PrevisaoDaAgendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: PermissionScopeService,
  ) {}

  async prever(
    filtro: { inicio: Date; fim: Date; plantaId?: string; equipamentoId?: string },
    user: ScopedUser | undefined,
    agora: Date = new Date(),
  ): Promise<PrevisaoDaAgenda> {
    const vazia: PrevisaoDaAgenda = { inicio: filtro.inicio, fim: filtro.fim, horizonte_dias: HORIZONTE_DIAS, itens: [], atrasados_antes: 0 };
    const { tarefas, doEscopo } = await this.tarefasNoAlcance(filtro, user);
    if (tarefas.length === 0) return vazia;
    // O item que segura o ciclo pode ser de outra planta (o equipamento mudou de
    // planta com a OS aberta): o ciclo continua programado, mas quem tem escopo
    // não vê o registro de fora
    const visivel = (aberto: ItemAberto | undefined) =>
      !aberto || !doEscopo || (aberto.planta_id && doEscopo.includes(aberto.planta_id))
        ? aberto
        : { ...aberto, programacao_id: null, os_id: null, status: null, data_programada: null };

    const ids = tarefas.map((t) => t.id.trim());
    const plantasDasTarefas = [...new Set(tarefas.map((t) => t.planta_id?.trim()).filter((id): id is string => !!id))];
    const [ultimas, ciclos, nomesDasPlantas, regraDa] = await Promise.all([
      buscarUltimasExecucoes(this.prisma, ids),
      buscarCiclosAbertos(this.prisma, ids),
      this.nomesDasPlantas(plantasDasTarefas),
      regrasDeDiasUteis(this.prisma, plantasDasTarefas),
    ]);

    const itens: CicloPrevisto[] = [];
    let atrasadosAntes = 0;
    const guardar = (item: CicloPrevisto) => {
      if (itens.length >= MAXIMO_DE_ITENS) {
        throw new BadRequestException(`A previsão passa de ${MAXIMO_DE_ITENS} ciclos: estreite o período ou filtre por planta ou equipamento`);
      }
      itens.push(item);
    };

    for (const tarefa of tarefas) {
      const regra = tarefa.planta_id ? regraDa(tarefa.planta_id) : undefined;
      const proxima = calcularProximaExecucao(tarefa, ultimas.get(tarefa.id.trim()));
      if (!proxima) continue;
      const intervalo = (intervaloEmDias(tarefa) ?? 0) * DIA_MS;
      if (intervalo <= 0) continue;

      // O ciclo de agora: o que o gerador vai olhar
      const atual = cicloNoSegundo(proxima);
      const aberto = visivel(cicloAberto(ciclos, tarefa.id, atual));
      const situacaoAtual: SituacaoDoCiclo = !tarefa.planta_id ? 'nao_sai' : aberto ? 'programado' : atual.getTime() < agora.getTime() ? 'atrasado' : 'previsto';
      if (atual.getTime() < filtro.inicio.getTime()) {
        const venceu = situacaoAtual === 'atrasado' || (situacaoAtual === 'nao_sai' && atual.getTime() < agora.getTime());
        if (venceu) atrasadosAntes++;
      } else if (atual.getTime() <= filtro.fim.getTime()) {
        guardar(this.item(tarefa, atual, situacaoAtual, aberto, regra, maior(new Date(atual.getTime() - HORIZONTE_DIAS * DIA_MS), agora), nomesDasPlantas));
      }

      // Os seguintes: o anterior feito no dia em que vence, ou agora se já venceu
      let feitoEm = maior(atual, agora);
      let ciclo = cicloNoSegundo(calcularProximaExecucao(tarefa, feitoEm) ?? new Date(feitoEm.getTime() + intervalo));
      if (ciclo.getTime() < filtro.inicio.getTime()) {
        // Pula direto para o período: o caminho até lá é aritmética, não laço
        const saltos = Math.ceil((filtro.inicio.getTime() - ciclo.getTime()) / intervalo);
        ciclo = new Date(ciclo.getTime() + saltos * intervalo);
        feitoEm = new Date(ciclo.getTime() - intervalo);
      }
      while (ciclo.getTime() <= filtro.fim.getTime()) {
        const situacao: SituacaoDoCiclo = tarefa.planta_id ? 'previsto' : 'nao_sai';
        // Só sai depois de o anterior ser feito, e não antes de entrar nos 60 dias
        const aPartirDe = maior(new Date(ciclo.getTime() - HORIZONTE_DIAS * DIA_MS), feitoEm, agora);
        guardar(this.item(tarefa, ciclo, situacao, undefined, regra, aPartirDe, nomesDasPlantas));
        feitoEm = ciclo;
        ciclo = new Date(ciclo.getTime() + intervalo);
      }
    }
    itens.sort((a, b) => a.ciclo.getTime() - b.ciclo.getTime() || a.tarefa_nome.localeCompare(b.tarefa_nome));
    return { ...vazia, itens, atrasados_antes: atrasadosAntes };
  }

  private item(
    tarefa: TarefaElegivel,
    ciclo: Date,
    situacao: SituacaoDoCiclo,
    aberto: ItemAberto | undefined,
    regra: RegraDeDiasUteis | undefined,
    aPartirDe: Date,
    nomesDasPlantas: Map<string, string>,
  ): CicloPrevisto {
    const dataReal = aberto?.data_programada ?? null;
    return {
      tarefa_id: tarefa.id.trim(),
      tarefa_tag: tarefa.tag,
      tarefa_nome: tarefa.nome,
      frequencia: tarefa.frequencia,
      equipamento_id: tarefa.equipamento_id.trim(),
      equipamento_nome: tarefa.equipamento?.nome ?? '',
      unidade_nome: tarefa.equipamento?.unidade?.nome ?? null,
      planta_id: tarefa.planta_id?.trim() ?? null,
      planta_nome: tarefa.planta_id ? (nomesDasPlantas.get(tarefa.planta_id.trim()) ?? null) : null,
      ciclo,
      data_programada: dataReal ?? (regra ? proximoDiaUtil(ciclo, regra) : ciclo),
      data_programada_estimada: !dataReal,
      situacao,
      motivo: situacao === 'nao_sai' ? SEM_PLANTA : null,
      programacao_a_partir_de: situacao === 'programado' || situacao === 'nao_sai' ? null : proximaRodadaDoGerador(aPartirDe),
      programacao_id: aberto?.programacao_id ?? null,
      os_id: aberto?.os_id ?? null,
      status_do_item: aberto?.status ?? null,
    };
  }

  /**
   * As tarefas elegíveis do filtro. O escopo e a planta pedida entram na
   * consulta: quem só vê uma planta não faz a API ler o banco inteiro.
   * Equipamento inclui os componentes dele.
   */
  private async tarefasNoAlcance(
    filtro: { plantaId?: string; equipamentoId?: string },
    user: ScopedUser | undefined,
  ): Promise<{ tarefas: TarefaElegivel[]; doEscopo: string[] | null }> {
    const escopo = await this.escopo.getScope(user);
    const doEscopo = this.escopo.isScoped(escopo) ? escopo.map((p) => p.trim()) : null;
    const nenhuma = { tarefas: [], doEscopo };
    const pedida = filtro.plantaId?.trim();
    if (doEscopo && (doEscopo.length === 0 || (pedida && !doEscopo.includes(pedida)))) return nenhuma;
    const plantas = pedida ? [pedida] : (doEscopo ?? undefined);

    let equipamentoIds: string[] | undefined;
    if (filtro.equipamentoId?.trim()) {
      const variantes = variantesDeIds([filtro.equipamentoId.trim()]);
      const doEquipamento = await this.prisma.equipamentos.findMany({
        where: { deleted_at: null, OR: [{ id: { in: variantes } }, { equipamento_pai_id: { in: variantes } }] },
        select: { id: true },
      });
      equipamentoIds = doEquipamento.map((e) => e.id.trim());
      if (equipamentoIds.length === 0) return nenhuma;
    }

    // A consulta já filtra; a planta efetiva confere de novo (UAR herda a do UC)
    const tarefas = (await buscarTarefasElegiveis(this.prisma, { equipamentoIds, plantas })).filter((t) => {
      const daTarefa = t.planta_id?.trim();
      if (doEscopo && (!daTarefa || !doEscopo.includes(daTarefa))) return false;
      return !pedida || daTarefa === pedida;
    });
    return { tarefas, doEscopo };
  }

  private async nomesDasPlantas(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const plantas = await this.prisma.plantas.findMany({ where: { id: { in: variantesDeIds(ids) } }, select: { id: true, nome: true } });
    return new Map(plantas.map((p) => [p.id.trim(), p.nome]));
  }
}
