import type { Prisma } from '@prisma/client';
import { valoresDasInstrucoes } from '../instrucoes/valor-da-instrucao';
import { variantesDeIds } from '../tarefas/ids';

/**
 * A tarefa de cada linha da OS por consulta própria, nunca pelo include:
 * `tarefas_os.tarefa_id` é Char(26) e `tarefas.id` VarChar(26) com o cuid de 25
 * caracteres. O Prisma casa a relação em JavaScript, e o include voltava null —
 * no dev, em todas as 586 linhas de tarefa. Sem a tarefa, a linha não achava a
 * instrução: sem o valor do cadastro no custo, nada congelado no finalizar e a OS
 * selada sem o valor para sempre (SN-93); e o sheet da OS perdia o atalho para
 * a instrução e o plano.
 */
export const SELECAO_DA_TAREFA = {
  id: true,
  nome: true,
  instrucao_id: true,
  plano_manutencao: { select: { id: true, nome: true } },
} satisfies Prisma.tarefasSelect;

export type TarefaDaLinha = Prisma.tarefasGetPayload<{ select: typeof SELECAO_DA_TAREFA }>;

type Leitor = Pick<Prisma.TransactionClient, 'tarefas'>;

/** Por id da tarefa, sem o espaço do Char(26) */
export async function tarefasDasLinhas(db: Leitor, tarefaIds: (string | null | undefined)[]): Promise<Map<string, TarefaDaLinha>> {
  const ids = [...new Set(tarefaIds.map((id) => id?.trim()).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const tarefas = await db.tarefas.findMany({ where: { id: { in: variantesDeIds(ids) } }, select: SELECAO_DA_TAREFA });
  return new Map(tarefas.map((t) => [t.id.trim(), t]));
}

/** A instrução de cada linha, na mesma ordem: a congelada (avulsa) ou a da tarefa (linha do plano) */
export async function instrucoesDasLinhas(
  db: Leitor,
  linhas: { instrucao_id: string | null; tarefa_id: string | null }[],
): Promise<(string | null)[]> {
  const tarefas = await tarefasDasLinhas(
    db,
    linhas.filter((l) => !l.instrucao_id?.trim()).map((l) => l.tarefa_id),
  );
  return linhas.map((l) => l.instrucao_id?.trim() || tarefas.get(l.tarefa_id?.trim() ?? '')?.instrucao_id?.trim() || null);
}

/**
 * O valor do cadastro de agora de cada linha sem valor (de antes do SN-93): o
 * que a aprovação (na programação) e o finalizar (na OS) congelam. A linha sem
 * instrução fica de fora.
 */
export async function valoresParaCongelar(
  db: Leitor & Pick<Prisma.TransactionClient, 'instrucao_recursos' | 'instrucao_maquinarios'>,
  linhas: { id: string; instrucao_id: string | null; tarefa_id: string | null }[],
): Promise<{ id: string; valor: number }[]> {
  if (linhas.length === 0) return [];
  const instrucoes = await instrucoesDasLinhas(db, linhas);
  if (!instrucoes.some(Boolean)) return [];
  const valores = await valoresDasInstrucoes(db, instrucoes);
  return linhas.flatMap((linha, i) => {
    const valor = instrucoes[i] ? valores.get(instrucoes[i]!)?.valor : undefined;
    return valor === undefined ? [] : [{ id: linha.id, valor }];
  });
}
