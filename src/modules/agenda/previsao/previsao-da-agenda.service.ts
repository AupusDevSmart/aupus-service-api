import { Injectable } from '@nestjs/common';
import { PermissionScopeService, PrismaService, type ScopedUser } from '@/core';
import { variantesDeIds } from '../../tarefas/ids';
import { calcularProximaExecucao } from '../../tarefas/periodicidade';
import {
  HORIZONTE_DIAS,
  buscarCiclosAbertos,
  buscarTarefasElegiveis,
  buscarUltimasExecucoes,
  cicloAberto,
  type TarefaElegivel,
} from '../../tarefas/ciclos-das-tarefas';
import { proximoDiaUtil, regraDeDiasUteis, type RegraDeDiasUteis } from '../dias-uteis';

const DIA_MS = 86_400_000;
/** Uma tarefa diária num ano dá 365: o teto segura frequência personalizada de 1 dia por anos. */
const CICLOS_POR_TAREFA = 400;
const MAXIMO_DE_ITENS = 5_000;

/**
 * - `programado`: o ciclo já tem programação ou OS aberta (o gerador não cria outra);
 * - `atrasado`: venceu e ainda não tem — o gerador o programa na próxima rodada;
 * - `previsto`: vence no futuro; `programacao_a_partir_de` diz quando o gerador o programa.
 */
export type SituacaoDoCiclo = 'programado' | 'atrasado' | 'previsto';

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
  /** A data prevista: o `ciclo_referencia` que o gerador grava. */
  ciclo: Date;
  /**
   * Para quando a programação sai: o próximo dia útil da planta. Estimativa: o
   * gerador junta tarefas da mesma instalação que vencem em 14 dias e programa
   * todas na data da primeira.
   */
  data_programada: Date;
  situacao: SituacaoDoCiclo;
  /** Quando o gerador cria a programação deste ciclo (o dia da rodada das 3h); null se já existe. */
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
  /** Passou de MAXIMO_DE_ITENS: estreitar o período ou filtrar. */
  truncado: boolean;
}

const maior = (a: Date, b: Date) => (a.getTime() >= b.getTime() ? a : b);

/**
 * A previsão dos ciclos de cada tarefa num período (SN-51), pela MESMA regra
 * do gerador: as consultas são as de ciclos-das-tarefas.ts e a conta é
 * `calcularProximaExecucao`. O primeiro ciclo é o de hoje (a partir da última
 * execução real e da âncora); os seguintes supõem cada ciclo feito no dia em
 * que vence — é a melhor previsão, e muda quando a execução real acontece.
 * Só tarefas das plantas que a pessoa enxerga.
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
    const vazia = { inicio: filtro.inicio, fim: filtro.fim, horizonte_dias: HORIZONTE_DIAS, itens: [], truncado: false };
    const tarefas = await this.tarefasNoAlcance(filtro, user);
    if (tarefas.length === 0) return vazia;

    const ids = tarefas.map((t) => t.id.trim());
    const [ultimas, ciclos, nomesDasPlantas] = await Promise.all([
      buscarUltimasExecucoes(this.prisma, ids),
      buscarCiclosAbertos(this.prisma, ids),
      this.nomesDasPlantas(tarefas),
    ]);
    const regras = new Map<string, Promise<RegraDeDiasUteis>>();
    const regraDa = (plantaId: string | null) => {
      const chave = plantaId ?? '';
      if (!regras.has(chave)) regras.set(chave, regraDeDiasUteis(this.prisma, plantaId ?? undefined));
      return regras.get(chave)!;
    };

    const itens: CicloPrevisto[] = [];
    let truncado = false;
    for (const tarefa of tarefas) {
      const regra = await regraDa(tarefa.planta_id);
      let ciclo = calcularProximaExecucao(tarefa, ultimas.get(tarefa.id.trim()));
      for (let n = 0; ciclo && ciclo.getTime() <= filtro.fim.getTime() && n < CICLOS_POR_TAREFA; n++) {
        if (ciclo.getTime() >= filtro.inicio.getTime()) {
          if (itens.length >= MAXIMO_DE_ITENS) {
            truncado = true;
            break;
          }
          // Só o ciclo de agora pode ter item aberto: o próximo nasce da execução deste
          const aberto = n === 0 ? cicloAberto(ciclos, tarefa.id, ciclo) : undefined;
          itens.push(this.item(tarefa, ciclo, aberto, regra, agora, nomesDasPlantas));
        }
        const seguinte = calcularProximaExecucao(tarefa, ciclo);
        if (!seguinte || seguinte.getTime() <= ciclo.getTime()) break;
        ciclo = seguinte;
      }
      if (truncado) break;
    }
    itens.sort((a, b) => a.ciclo.getTime() - b.ciclo.getTime() || a.tarefa_nome.localeCompare(b.tarefa_nome));
    return { ...vazia, itens, truncado };
  }

  private item(
    tarefa: TarefaElegivel,
    ciclo: Date,
    aberto: ReturnType<typeof cicloAberto>,
    regra: RegraDeDiasUteis,
    agora: Date,
    nomesDasPlantas: Map<string, string>,
  ): CicloPrevisto {
    const situacao: SituacaoDoCiclo = aberto ? 'programado' : ciclo.getTime() < agora.getTime() ? 'atrasado' : 'previsto';
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
      data_programada: proximoDiaUtil(ciclo, regra),
      situacao,
      // O gerador cria quando o ciclo entra nos 60 dias; o que já entrou sai na próxima rodada
      programacao_a_partir_de: aberto ? null : maior(new Date(ciclo.getTime() - HORIZONTE_DIAS * DIA_MS), agora),
      programacao_id: aberto?.programacao_id ?? null,
      os_id: aberto?.os_id ?? null,
      status_do_item: aberto?.status ?? null,
    };
  }

  /** As tarefas elegíveis do filtro, só nas plantas do escopo. Equipamento inclui os componentes dele. */
  private async tarefasNoAlcance(filtro: { plantaId?: string; equipamentoId?: string }, user: ScopedUser | undefined): Promise<TarefaElegivel[]> {
    let equipamentoIds: string[] | undefined;
    if (filtro.equipamentoId?.trim()) {
      const variantes = variantesDeIds([filtro.equipamentoId.trim()]);
      const doEquipamento = await this.prisma.equipamentos.findMany({
        where: { OR: [{ id: { in: variantes } }, { equipamento_pai_id: { in: variantes } }] },
        select: { id: true },
      });
      equipamentoIds = doEquipamento.map((e) => e.id.trim());
      if (equipamentoIds.length === 0) return [];
    }

    const escopo = await this.escopo.getScope(user);
    const plantasDoEscopo = this.escopo.isScoped(escopo) ? new Set(escopo.map((p) => p.trim())) : null;
    const planta = filtro.plantaId?.trim();
    return (await buscarTarefasElegiveis(this.prisma, { equipamentoIds })).filter((t) => {
      const daTarefa = t.planta_id?.trim();
      if (plantasDoEscopo && (!daTarefa || !plantasDoEscopo.has(daTarefa))) return false;
      return !planta || daTarefa === planta;
    });
  }

  private async nomesDasPlantas(tarefas: TarefaElegivel[]): Promise<Map<string, string>> {
    const ids = [...new Set(tarefas.map((t) => t.planta_id?.trim()).filter((id): id is string => !!id))];
    if (ids.length === 0) return new Map();
    const plantas = await this.prisma.plantas.findMany({ where: { id: { in: variantesDeIds(ids) } }, select: { id: true, nome: true } });
    return new Map(plantas.map((p) => [p.id.trim(), p.nome]));
  }
}
