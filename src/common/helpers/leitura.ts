import type { Prisma } from '@/core';

/**
 * Leituras no checklist da OS (SN-58).
 *
 * O passo da instrução é uma VERIFICACAO (marcar feito) ou uma LEITURA (digitar
 * o valor medido, com unidade e faixa aceitável). O item da OS congela tipo,
 * unidade e faixa ao nascer, como congela o texto: mudar a faixa na instrução
 * não muda o que a OS antiga pediu.
 *
 * Fora da faixa não é coluna: sai sempre desta conta, para a tela, a API e o
 * PDF não discordarem. Os limites fazem parte da faixa (10 a 20 aceita 10).
 */
/** Como o passo se registra na OS. No passo da instrução é `registro` (SN-85: `tipo` é a disciplina); no item da OS, `tipo` */
export const REGISTROS_DO_PASSO = ['VERIFICACAO', 'LEITURA'] as const;
export type RegistroDoPasso = (typeof REGISTROS_DO_PASSO)[number];

/** Decimal(14, 4): até 10 dígitos antes da vírgula. */
export const LIMITE_DA_LEITURA = 9_999_999_999;

type Numero = Prisma.Decimal | number | null | undefined;

export interface Faixa {
  valor_minimo?: Numero;
  valor_maximo?: Numero;
}

export const numeroOuNulo = (v: Numero): number | null => (v === null || v === undefined ? null : Number(v));

export function foraDaFaixa(valor: Numero, faixa: Faixa): boolean {
  const lido = numeroOuNulo(valor);
  if (lido === null) return false;
  const minimo = numeroOuNulo(faixa.valor_minimo);
  const maximo = numeroOuNulo(faixa.valor_maximo);
  return (minimo !== null && lido < minimo) || (maximo !== null && lido > maximo);
}

/** 2.5 -> "2,5": como a tela e o PDF escrevem número. */
export const comVirgula = (n: number) => String(n).replace('.', ',');

/** "10 a 20 V", "no mínimo 10 V", "no máximo 20 V"; sem faixa, vazio. */
export function descreverFaixa(faixa: Faixa & { unidade?: string | null }): string {
  const minimo = numeroOuNulo(faixa.valor_minimo);
  const maximo = numeroOuNulo(faixa.valor_maximo);
  const unidade = faixa.unidade?.trim() ? ` ${faixa.unidade.trim()}` : '';
  if (minimo !== null && maximo !== null) return `${comVirgula(minimo)} a ${comVirgula(maximo)}${unidade}`;
  if (minimo !== null) return `no mínimo ${comVirgula(minimo)}${unidade}`;
  if (maximo !== null) return `no máximo ${comVirgula(maximo)}${unidade}`;
  return '';
}
