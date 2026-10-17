import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { StatusOS } from '@/core';

/**
 * A OS finalizada ou cancelada é registro fechado: nada do que foi feito nela
 * (materiais, ferramentas, anexos) muda mais. Checklist e tarefas têm regra
 * mais estreita (só em execução ou pausada) — ver `exigirEmExecucao`.
 */
const FECHADAS: Partial<Record<StatusOS, string>> = {
  [StatusOS.FINALIZADA]: 'finalizada',
  [StatusOS.CANCELADA]: 'cancelada',
};

export function exigirOSAlteravel(status: string): void {
  const fechada = FECHADAS[status as StatusOS];
  if (fechada) throw new ConflictException(`A OS está ${fechada} e não pode mais ser alterada.`);
}

/**
 * A OS travada para leitura até o fim da transação, e o status conferido de
 * novo (SN-62). O finalizar trava a linha para gravar e grava o conteúdo que o
 * código de verificação prova: anexo, material ou ferramenta gravado no meio,
 * com o status lido sem trava, ficava na OS finalizada fora do conteúdo — e a
 * conferência dizia "não confere" numa OS que ninguém adulterou. Com a trava,
 * um espera o outro: o que chega depois recebe o 409 de OS finalizada.
 */
export async function travarOSAlteravel(tx: Pick<Prisma.TransactionClient, '$queryRaw'>, osId: string): Promise<void> {
  const [os] = await tx.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM ordens_servico WHERE id = ${osId} FOR SHARE`;
  if (!os) throw new NotFoundException('Ordem de serviço não encontrada');
  exigirOSAlteravel(os.status);
}
