import type { Prisma } from '@prisma/client';
import { variantesDeIds } from '../tarefas/ids';

/**
 * A estimativa que o servidor põe quando ninguém estimou: 2 h de trabalho e 3 h
 * de duração. O painel conta à parte as OS que ficaram nela (SN-81): somar o
 * padrão no backlog como se fosse estimativa enganava.
 */
export const ESTIMATIVA_PADRAO = { tempo_estimado: 2, duracao_estimada: 3 } as const;

/**
 * As estimativas que ninguém fez: o padrão do servidor e o par que o formulário
 * gravava antes do SN-81 (a duração já vinha preenchida com 6 e o tempo,
 * escondido, com 4). O painel reconhece pelos números: a OS estimada de verdade
 * em exatamente esses valores também conta como sem estimativa.
 */
export const ESTIMATIVAS_INVENTADAS = [ESTIMATIVA_PADRAO, { tempo_estimado: 4, duracao_estimada: 6 }] as const;

/** O maior valor que `Decimal(5, 2)` guarda: acima, a programação do cron não era criada */
export const MAXIMO_DE_HORAS = 999.99;

/** As horas das instruções e quantas tarefas não tinham tempo nelas */
export interface HorasDasInstrucoes {
  horas: number;
  tarefasSemTempo: number;
}

/**
 * Quantas horas as tarefas levam pelas instruções delas: a soma das durações
 * dos passos (`duracao_horas`, SN-85; era `tempo_estimado` em minutos), a mesma
 * que a tela da instrução mostra. A tarefa conta a sua instrução uma vez por
 * tarefa; sem instrução ou sem passo com duração, não soma (e entra em
 * `tarefasSemTempo`). Sem teto: quem grava corta no que a coluna guarda.
 *
 * Pelas variantes do id: `sub_instrucoes.instrucao_id` é Char(26) e
 * `tarefas.instrucao_id` VarChar — com id de 25 caracteres, o id cru não casa.
 */
export async function horasDasInstrucoes(
  prisma: Pick<Prisma.TransactionClient, 'sub_instrucoes'>,
  instrucoesDasTarefas: (string | null)[],
): Promise<HorasDasInstrucoes> {
  const ids = instrucoesDasTarefas.map((id) => id?.trim()).filter((id): id is string => !!id);
  if (ids.length === 0) return { horas: 0, tarefasSemTempo: instrucoesDasTarefas.length };

  const linhas = await prisma.sub_instrucoes.groupBy({
    by: ['instrucao_id'],
    where: { instrucao_id: { in: variantesDeIds([...new Set(ids)]) } },
    _sum: { duracao_horas: true },
  });
  const horasPorInstrucao = new Map(linhas.map((l) => [l.instrucao_id.trim(), Number(l._sum.duracao_horas ?? 0)]));

  const horas = ids.reduce((soma, id) => soma + (horasPorInstrucao.get(id) ?? 0), 0);
  const comTempo = ids.filter((id) => (horasPorInstrucao.get(id) ?? 0) > 0).length;
  return { horas: Math.round(horas * 100) / 100, tarefasSemTempo: instrucoesDasTarefas.length - comTempo };
}
