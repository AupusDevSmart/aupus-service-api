import type { PrismaClient } from '@prisma/client';
import { numeroOuNulo } from '@/common/helpers/leitura';
import { variantesDeIds } from './ids';

/** Uma etapa (sub-instrução) como as telas de OS leem pela tarefa. */
export interface EtapaDaInstrucao {
  id: string;
  descricao: string;
  obrigatoria: boolean;
  ordem: number;
  tempo_estimado: number | null;
  /** SN-58: VERIFICACAO ou LEITURA, com unidade e faixa */
  tipo: string;
  unidade: string | null;
  valor_minimo: number | null;
  valor_maximo: number | null;
}

type ComInstrucao = { instrucao?: { id: string } | null };

/**
 * As etapas da instrução de cada tarefa, por consulta própria e não pelo
 * include. `sub_instrucoes.instrucao_id` é Char(26), com espaço no fim, e
 * `instrucoes.id` é VarChar: para instrução de id com 25 caracteres o Prisma
 * casa a relação em JS e devolvia a lista VAZIA (medido na INST-012 do dev: 4
 * passos, 0 na tarefa). As telas de OS mostravam a tarefa sem etapas.
 */
export async function comEtapas<T extends ComInstrucao>(
  prisma: Pick<PrismaClient, 'sub_instrucoes'>,
  tarefas: T[],
): Promise<Array<T & { instrucao?: (NonNullable<T['instrucao']> & { sub_instrucoes: EtapaDaInstrucao[] }) | null }>> {
  const ids = [...new Set(tarefas.map((t) => t.instrucao?.id.trim()).filter((i): i is string => !!i))];
  const etapas = ids.length
    ? await prisma.sub_instrucoes.findMany({
        where: { instrucao_id: { in: variantesDeIds(ids) } },
        orderBy: { ordem: 'asc' },
        select: {
          id: true,
          instrucao_id: true,
          descricao: true,
          obrigatoria: true,
          ordem: true,
          tempo_estimado: true,
          tipo: true,
          unidade: true,
          valor_minimo: true,
          valor_maximo: true,
        },
      })
    : [];

  const porInstrucao = new Map<string, EtapaDaInstrucao[]>();
  for (const { instrucao_id, valor_minimo, valor_maximo, ...etapa } of etapas) {
    const chave = instrucao_id.trim();
    porInstrucao.set(chave, [
      ...(porInstrucao.get(chave) ?? []),
      { ...etapa, id: etapa.id.trim(), valor_minimo: numeroOuNulo(valor_minimo), valor_maximo: numeroOuNulo(valor_maximo) },
    ]);
  }

  return tarefas.map((t) =>
    t.instrucao ? { ...t, instrucao: { ...t.instrucao, sub_instrucoes: porInstrucao.get(t.instrucao.id.trim()) ?? [] } } : t,
  ) as Array<T & { instrucao?: (NonNullable<T['instrucao']> & { sub_instrucoes: EtapaDaInstrucao[] }) | null }>;
}
