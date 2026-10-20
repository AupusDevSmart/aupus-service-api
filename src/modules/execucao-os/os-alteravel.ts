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
 *
 * Devolve o status lido com a trava. `gravar` é para quem também grava na
 * linha da OS (o custo real, SN-81): com a trava de leitura, dois que
 * gravassem juntos travariam um ao outro (o Postgres aborta um: 500). NO KEY
 * UPDATE, não UPDATE: não segura quem insere um filho da OS (histórico,
 * anexo), cuja FK só pede KEY SHARE.
 */
export async function travarOSAlteravel(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  osId: string,
  modo: 'ler' | 'gravar' = 'ler',
): Promise<StatusOS> {
  const [os] =
    modo === 'gravar'
      ? await tx.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM ordens_servico WHERE id = ${osId} FOR NO KEY UPDATE`
      : await tx.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM ordens_servico WHERE id = ${osId} FOR SHARE`;
  if (!os) throw new NotFoundException('Ordem de serviço não encontrada');
  exigirOSAlteravel(os.status);
  return os.status as StatusOS;
}
