import { Prisma, StatusOS } from '@/core';
import { passouDoPrazo } from '@/common/helpers/prazo-da-os';

type Leitor = { ordens_servico: { findMany: (args: Prisma.ordens_servicoFindManyArgs) => Promise<unknown[]> } };

/** Só a OS que ainda pede trabalho atrasa; a executada esperando auditoria já foi feita */
export const STATUS_QUE_ATRASAM = [StatusOS.PENDENTE, StatusOS.EM_EXECUCAO, StatusOS.PAUSADA];

/**
 * Os ids das OS atrasadas: abertas e com o prazo vencido (`prazoDaOrdem`, a mesma
 * regra do painel). O cartão "Atrasadas" e o filtro da lista de execução contavam
 * a programada antes da meia-noite do SERVIDOR que não estivesse finalizada nem
 * cancelada: entravam a executada e a auditada (já feitas), e o prazo de quem
 * passa do dia não valia. A conta é em JavaScript porque o prazo depende da
 * duração de cada OS; são só as abertas com data, o backlog.
 */
export async function idsDasAtrasadas(db: Leitor, where: Prisma.ordens_servicoWhereInput, agora = new Date()): Promise<string[]> {
  const abertas = (await db.ordens_servico.findMany({
    where: { AND: [where, { status: { in: STATUS_QUE_ATRASAM }, data_hora_programada: { not: null } }] },
    select: { id: true, data_hora_programada: true, duracao_estimada: true },
  })) as { id: string; data_hora_programada: Date | null; duracao_estimada: Prisma.Decimal | null }[];
  return abertas.filter((o) => passouDoPrazo(o, agora)).map((o) => o.id);
}
