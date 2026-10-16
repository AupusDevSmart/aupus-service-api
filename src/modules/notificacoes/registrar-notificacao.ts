import type { Prisma } from '@prisma/client';
import type { Entidade, Evento } from './catalogo';

type ComOsEventos = Pick<Prisma.TransactionClient, 'notificacoes_eventos'>;

/**
 * Grava o evento que vai virar aviso (SN-47), NA TRANSAÇÃO de quem mudou o
 * status: se ela desfaz, o evento some junto, e a prévia da importação (que
 * desfaz tudo no fim) não avisa ninguém. Quem recebe e o texto quem decide é o
 * processador, que lê o registro depois. Passe `tx` dentro de um $transaction;
 * fora dele, o próprio prisma.
 */
export async function registrarNotificacao(
  tx: ComOsEventos,
  e: { evento: Evento; entidade: Entidade; entidadeId: string; atorId?: string | null },
): Promise<void> {
  await tx.notificacoes_eventos.create({
    data: {
      evento: e.evento,
      entidade: e.entidade,
      entidade_id: e.entidadeId.trim(),
      ator_id: e.atorId?.trim() || null,
      criado_em: new Date(),
    },
  });
}
