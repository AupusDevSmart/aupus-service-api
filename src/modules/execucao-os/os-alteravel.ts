import { ConflictException } from '@nestjs/common';
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
