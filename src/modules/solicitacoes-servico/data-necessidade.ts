/**
 * Normaliza o "Precisa até" (`data_necessidade`) antes de chegar ao Prisma.
 *
 * O campo da tela e `datetime-local`, que devolve `2026-09-29T09:00` — sem
 * segundos e sem fuso. O `@IsDateString()` que o DTO tinha aceitava essa
 * forma, e o Prisma recusava ("Invalid value for argument data_necessidade"):
 * a solicitacao nao salvava e a tela recebia 500.
 *
 * O front manda ISO com fuso (convertido no navegador) e o DTO exige o fuso
 * (`@InstanteComFuso`, SN-74). Isto fica para quem chama o service sem passar
 * pelo pipe: string vira `Date`, e string vazia vira `null` (limpar o campo).
 */
export function comDataNecessidadeNormalizada<T extends Record<string, unknown>>(
  dados: T,
): Omit<T, 'data_necessidade'> & { data_necessidade?: unknown } {
  const valor = dados.data_necessidade;
  if (typeof valor !== 'string') return dados;

  const texto = valor.trim();
  return { ...dados, data_necessidade: texto ? new Date(texto) : null };
}
