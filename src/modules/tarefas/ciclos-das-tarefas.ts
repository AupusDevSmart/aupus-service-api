import type { Prisma, PrismaService } from '@/core';
import { equipamentoNasPlantas, plantaDeCadaEquipamento } from '@/core/modules/auth/planta-dos-equipamentos';
import { variantesDeIds } from './ids';

/**
 * As consultas que decidem o ciclo de cada tarefa, usadas pelo gerador
 * (TarefasSchedulerService) e pela previsão da agenda (SN-51). Ficam aqui, num
 * lugar só, para a previsão ser a MESMA regra do gerador e não uma cópia que
 * diverge: a tela já disse "atrasada" enquanto o cron via a tarefa em dia.
 */

/** O gerador cria a programação do ciclo que vence até este tanto de dias à frente. */
export const HORIZONTE_DIAS = 60;

/** O fuso da rodada do gerador (@Cron) e da regra de dias úteis: Brasília, sem horário de verão. */
export const FUSO_DO_GERADOR = 'America/Sao_Paulo';
const UMA_HORA = 3_600_000;
const UM_DIA = 24 * UMA_HORA;

/**
 * O ciclo no segundo, como o Postgres o guarda: `ciclo_referencia` é
 * TIMESTAMP(0) e ARREDONDA os milissegundos. A data de conclusão da OS tem
 * milissegundos, então o ciclo calculado depois dela também tinha — e não
 * casava com o gravado: o gerador não via o ciclo aberto e criava a mesma
 * programação toda madrugada (achado na revisão do SN-51). Toda conta de
 * ciclo passa por aqui antes de comparar ou gravar.
 */
export const cicloNoSegundo = (ciclo: Date): Date => new Date(Math.round(ciclo.getTime() / 1000) * 1000);

/** A primeira rodada do gerador (todo dia às 3h de Brasília) em ou depois do instante. */
export function proximaRodadaDoGerador(instante: Date): Date {
  // Brasília é UTC-3 fixo: 3h de lá são 6h UTC
  const diaEmBrasilia = Math.floor((instante.getTime() - 3 * UMA_HORA) / UM_DIA) * UM_DIA;
  const rodada = diaEmBrasilia + 6 * UMA_HORA;
  return new Date(rodada >= instante.getTime() ? rodada : rodada + UM_DIA);
}

export interface TarefaElegivel {
  id: string;
  nome: string;
  tag: string;
  criticidade: number | null;
  frequencia: string | null;
  frequencia_personalizada: number | null;
  data_ultima_execucao: Date | null;
  data_ancora: Date | null;
  created_at: Date;
  // A duracao vem da instrucao: a tarefa nao guarda mais esse dado.
  instrucao: { tempo_estimado: number; duracao_estimada: Prisma.Decimal } | null;
  equipamento_id: string;
  equipamento: {
    id: string;
    nome: string;
    criticidade: string;
    unidade_id: string | null;
    unidade: {
      id: string;
      nome: string;
      planta_id: string | null;
    } | null;
  };
  /** A planta efetiva (equipamento, unidade, ou unidade do UC pai): a da programação. */
  planta_id: string | null;
  proxima_execucao?: Date;
  /** O mesmo ciclo pelas duas contas (casa a programação aberta gravada pela outra, SN-54). */
  ciclos_equivalentes?: Date[];
}

/**
 * Tarefas ATIVAS de planos ATIVOS com frequência definida, de equipamento que
 * não foi excluído. `equipamentoIds` restringe aos equipamentos dados (a
 * previsão de um equipamento; o gerador rodado num teste sem tocar o resto do
 * banco); `plantas`, às plantas dadas, na consulta (a previsão de quem tem
 * escopo não lê o banco inteiro).
 */
/**
 * O que faz uma tarefa ser programada pelo gerador. Num lugar só: o filtro de
 * atrasadas de GET /tarefas usa o mesmo (sem ele, a tarefa de template, a
 * inativa e a removida apareciam atrasadas para sempre).
 */
export function ondeElegivel(filtro: { equipamentoIds?: string[]; plantas?: string[] } = {}): Prisma.tarefasWhereInput {
  return {
    deleted_at: null,
    // Equipamento excluído não tem mais o que manter: antes a tarefa dele caía
    // em "falhas" toda madrugada ou saía numa preventiva com equipamento apagado.
    // Nem o componente de UC excluído: excluir a unidade ou a planta só marca
    // o equipamento que tem unidade_id, e a UAR (sem unidade) ficava viva
    equipamento: {
      deleted_at: null,
      // AND: os dois filtros são OR, e espalhados na mesma chave um apagaria o outro
      AND: [
        { OR: [{ equipamento_pai_id: null }, { equipamento_pai: { deleted_at: null } }] },
        ...(filtro.plantas ? [equipamentoNasPlantas(variantesDeIds(filtro.plantas))] : []),
      ],
    },
    ativo: true,
    frequencia: { not: null },
    // Tarefa de template nao gera OS: ela nao tem equipamento e serve
    // apenas de molde para as copias.
    equipamento_id: filtro.equipamentoIds ? { in: variantesDeIds(filtro.equipamentoIds) } : { not: null },
    // Removida localmente: o usuario tirou a tarefa daquele equipamento.
    origem_status: { not: 'REMOVIDA' },
    // So copias vinculadas a equipamento. Tarefa avulsa (sem plano) segue
    // valendo — e o caso da tarefa criada direto no equipamento.
    OR: [
      { plano_manutencao: { plano_origem_id: { not: null }, ativo: true } },
      { plano_manutencao_id: null },
    ],
  };
}

export async function buscarTarefasElegiveis(
  prisma: PrismaService,
  filtro: { equipamentoIds?: string[]; plantas?: string[] } = {},
): Promise<TarefaElegivel[]> {
  const tarefas = await prisma.tarefas.findMany({
    where: ondeElegivel(filtro),
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
              planta_id: true,
            },
          },
          equipamento_pai: {
            select: { unidade_id: true, unidade: { select: { id: true, nome: true, planta_id: true } } },
          },
        },
      },
    },
  });

  // Componente (UAR) não tem unidade: vale a do UC pai. Sem isso as tarefas de
  // componentes de plantas diferentes caíam no mesmo grupo "sem_unidade", a
  // preventiva saía misturando plantas e sem os feriados da planta.
  const comUnidadeEfetiva = tarefas.map(({ equipamento: comPai, ...tarefa }) => {
    if (!comPai) return { ...tarefa, equipamento: null };
    const { equipamento_pai: pai, ...equipamento } = comPai;
    return {
      ...tarefa,
      equipamento: equipamento.unidade
        ? equipamento
        : { ...equipamento, unidade_id: pai?.unidade_id ?? null, unidade: pai?.unidade ?? null },
    };
  });
  const plantas = await plantaDeCadaEquipamento(prisma, comUnidadeEfetiva.map((t) => t.equipamento_id));
  return comUnidadeEfetiva.map((t) => ({ ...t, planta_id: plantas.get(t.equipamento_id?.trim()) ?? null }));
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
 * Agregado no banco (a maior por tarefa): o historico cresce para sempre, e a
 * previsao roda a cada pedido, nao so de madrugada.
 */
export async function buscarUltimasExecucoes(prisma: PrismaService, tarefaIds: string[]): Promise<Map<string, Date>> {
  if (tarefaIds.length === 0) return new Map();

  const vinculos = await prisma.tarefas_os.groupBy({
    by: ['tarefa_id'],
    _max: { data_conclusao: true },
    where: {
      // As duas formas do id: Char(26) e blank-padded, o id da tarefa tem 25.
      // Sem isto o cron nao enxergava execucao nenhuma e tratava toda tarefa
      // antiga como se nunca tivesse rodado.
      tarefa_id: { in: variantesDeIds(tarefaIds) },
      status: 'CONCLUIDA',
      data_conclusao: { not: null },
      ordem_servico: { status: 'FINALIZADA' },
    },
  });

  const ultimas = new Map<string, Date>();
  for (const vinculo of vinculos) {
    const id = vinculo.tarefa_id?.trim();
    const data = vinculo._max.data_conclusao;
    if (!id || !data) continue;

    // As duas formas do id (com e sem espaço) caem na mesma tarefa: fica a maior
    const atual = ultimas.get(id);
    if (!atual || data > atual) ultimas.set(id, data);
  }

  return ultimas;
}

export const chaveCiclo = (tarefaId: string, ciclo?: Date | null): string => `${tarefaId}|${ciclo ? cicloNoSegundo(ciclo).getTime() : 'sem-ciclo'}`;

/** O item que segura o ciclo: a programação ainda não aprovada ou a OS que nasceu dela. */
export interface ItemAberto {
  programacao_id: string | null;
  os_id: string | null;
  /** null quando quem pede não pode ver o registro. */
  status: string | null;
  /** A data marcada no registro (a da OS, se já há): é a que vale, não a estimada. */
  data_programada: Date | null;
  /** A planta do registro: quem tem escopo só vê o registro da planta dele. */
  planta_id: string | null;
}

/**
 * A data da programação: `data_hora_programada` vem do gerador; a do formulário
 * vai para `data_previsao_inicio` (o campo da hora segue comentado na tela).
 * É a mesma escolha que a aprovação faz ao criar a OS.
 */
export const dataDaProgramacao = (p: { data_hora_programada: Date | null; data_previsao_inicio: Date | null }): Date | null =>
  p.data_hora_programada ?? p.data_previsao_inicio;

/**
 * Os ciclos que ja tem item ABERTO, por `chaveCiclo`.
 *
 * O bloqueio e por ciclo e so vale enquanto ha item aberto. OS finalizada ou
 * cancelada nao bloqueia: quem move o ciclo adiante e a execucao efetiva
 * (finalizada) ou a ancora (cancelada). Tarefa que nao foi concluida volta ao
 * pool no MESMO ciclo, como atrasada — e assim que entra numa programacao
 * nova, esta fica PENDENTE e segura as geracoes seguintes.
 */
export async function buscarCiclosAbertos(prisma: PrismaService, tarefaIds: string[]): Promise<Map<string, ItemAberto>> {
  if (tarefaIds.length === 0) return new Map();

  const [vinculosProgramacao, vinculosOS] = await Promise.all([
    prisma.tarefas_programacao_os.findMany({
      where: {
        tarefa_id: { in: variantesDeIds(tarefaIds) },
        programacao: {
          is: {
            status: { in: ['PENDENTE', 'APROVADA'] },
            deletado_em: null,
          },
        },
      },
      select: {
        tarefa_id: true,
        ciclo_referencia: true,
        programacao_id: true,
        programacao: { select: { status: true, data_hora_programada: true, data_previsao_inicio: true, planta_id: true } },
      },
    }),
    prisma.tarefas_os.findMany({
      where: {
        tarefa_id: { in: variantesDeIds(tarefaIds) },
        ordem_servico: {
          status: { in: ['PENDENTE', 'EM_EXECUCAO', 'PAUSADA', 'EXECUTADA', 'AUDITADA'] },
        },
      },
      select: { tarefa_id: true, ciclo_referencia: true, os_id: true, ordem_servico: { select: { status: true, data_hora_programada: true, planta_id: true } } },
    }),
  ]);

  const ciclos = new Map<string, ItemAberto>();
  for (const v of vinculosProgramacao) {
    const id = v.tarefa_id?.trim();
    if (!id) continue;
    ciclos.set(chaveCiclo(id, v.ciclo_referencia), {
      programacao_id: v.programacao_id?.trim() ?? null,
      os_id: null,
      status: v.programacao?.status ?? 'PENDENTE',
      data_programada: v.programacao ? dataDaProgramacao(v.programacao) : null,
      planta_id: v.programacao?.planta_id?.trim() ?? null,
    });
  }
  // A OS vale mais que a programação de onde saiu: é ela que a pessoa abre
  for (const v of vinculosOS) {
    const id = v.tarefa_id?.trim();
    if (!id) continue;
    const chave = chaveCiclo(id, v.ciclo_referencia);
    ciclos.set(chave, {
      programacao_id: ciclos.get(chave)?.programacao_id ?? null,
      os_id: v.os_id?.trim() ?? null,
      status: v.ordem_servico?.status ?? 'PENDENTE',
      data_programada: v.ordem_servico?.data_hora_programada ?? ciclos.get(chave)?.data_programada ?? null,
      planta_id: v.ordem_servico?.planta_id?.trim() ?? ciclos.get(chave)?.planta_id ?? null,
    });
  }
  return ciclos;
}

/**
 * O item aberto que segura este ciclo da tarefa, se há. Vinculos anteriores a
 * `ciclo_referencia` nao tem ciclo gravado: nesses casos vale o comportamento
 * antigo, de bloquear a tarefa inteira, em vez de arriscar programacao duplicada.
 */
/**
 * `equivalentes`: o mesmo ciclo pelas duas contas (`ciclosEquivalentes`,
 * SN-54). A programação aberta pode ter o ciclo gravado pela conta que não é a
 * da vez — antes de ligar a periodicidade por calendário ou depois de desligar
 * —, e só pela data da vez o gerador criaria outra para o mesmo vencimento.
 */
export function cicloAberto(
  ciclos: Map<string, ItemAberto>,
  tarefaId: string,
  ciclo: Date | null | undefined,
  equivalentes: (Date | null | undefined)[] = [],
): ItemAberto | undefined {
  const id = tarefaId.trim();
  for (const candidato of [ciclo, ...equivalentes]) {
    const aberto = candidato ? ciclos.get(chaveCiclo(id, candidato)) : undefined;
    if (aberto) return aberto;
  }
  return ciclos.get(chaveCiclo(id, null));
}
