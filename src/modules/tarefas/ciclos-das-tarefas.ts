import type { Prisma, PrismaService } from '@/core';
import { plantaDeCadaEquipamento } from '@/core/modules/auth/planta-dos-equipamentos';
import { variantesDeIds } from './ids';

/**
 * As consultas que decidem o ciclo de cada tarefa, usadas pelo gerador
 * (TarefasSchedulerService) e pela previsão da agenda (SN-51). Ficam aqui, num
 * lugar só, para a previsão ser a MESMA regra do gerador e não uma cópia que
 * diverge: a tela já disse "atrasada" enquanto o cron via a tarefa em dia.
 */

/** O gerador cria a programação do ciclo que vence até este tanto de dias à frente. */
export const HORIZONTE_DIAS = 60;

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
}

/**
 * Tarefas ATIVAS de planos ATIVOS com frequência definida. `equipamentoIds`
 * restringe aos equipamentos dados (a previsão de um equipamento; o gerador
 * rodado num teste sem tocar o resto do banco).
 */
export async function buscarTarefasElegiveis(prisma: PrismaService, filtro: { equipamentoIds?: string[] } = {}): Promise<TarefaElegivel[]> {
  const tarefas = await prisma.tarefas.findMany({
    where: {
      deleted_at: null,
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
 * Uma query agregada para todas as tarefas, sem N+1.
 */
export async function buscarUltimasExecucoes(prisma: PrismaService, tarefaIds: string[]): Promise<Map<string, Date>> {
  if (tarefaIds.length === 0) return new Map();

  const vinculos = await prisma.tarefas_os.findMany({
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

export const chaveCiclo = (tarefaId: string, ciclo?: Date | null): string => `${tarefaId}|${ciclo ? ciclo.getTime() : 'sem-ciclo'}`;

/** O item que segura o ciclo: a programação ainda não aprovada ou a OS que nasceu dela. */
export interface ItemAberto {
  programacao_id: string | null;
  os_id: string | null;
  status: string;
}

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
      select: { tarefa_id: true, ciclo_referencia: true, programacao_id: true, programacao: { select: { status: true } } },
    }),
    prisma.tarefas_os.findMany({
      where: {
        tarefa_id: { in: variantesDeIds(tarefaIds) },
        ordem_servico: {
          status: { in: ['PENDENTE', 'EM_EXECUCAO', 'PAUSADA', 'EXECUTADA', 'AUDITADA'] },
        },
      },
      select: { tarefa_id: true, ciclo_referencia: true, os_id: true, ordem_servico: { select: { status: true } } },
    }),
  ]);

  const ciclos = new Map<string, ItemAberto>();
  for (const v of vinculosProgramacao) {
    const id = v.tarefa_id?.trim();
    if (!id) continue;
    ciclos.set(chaveCiclo(id, v.ciclo_referencia), { programacao_id: v.programacao_id?.trim() ?? null, os_id: null, status: v.programacao?.status ?? 'PENDENTE' });
  }
  // A OS vale mais que a programação de onde saiu: é ela que a pessoa abre
  for (const v of vinculosOS) {
    const id = v.tarefa_id?.trim();
    if (!id) continue;
    const chave = chaveCiclo(id, v.ciclo_referencia);
    ciclos.set(chave, { programacao_id: ciclos.get(chave)?.programacao_id ?? null, os_id: v.os_id?.trim() ?? null, status: v.ordem_servico?.status ?? 'PENDENTE' });
  }
  return ciclos;
}

/**
 * O item aberto que segura este ciclo da tarefa, se há. Vinculos anteriores a
 * `ciclo_referencia` nao tem ciclo gravado: nesses casos vale o comportamento
 * antigo, de bloquear a tarefa inteira, em vez de arriscar programacao duplicada.
 */
export function cicloAberto(ciclos: Map<string, ItemAberto>, tarefaId: string, ciclo: Date | null | undefined): ItemAberto | undefined {
  const id = tarefaId.trim();
  return ciclos.get(chaveCiclo(id, null)) ?? (ciclo ? ciclos.get(chaveCiclo(id, ciclo)) : undefined);
}
