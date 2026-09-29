/**
 * Normaliza o "Precisa até" (`data_necessidade`) antes de chegar ao Prisma.
 *
 * O campo da tela e `datetime-local`, que devolve `2026-09-29T09:00` — sem
 * segundos e sem fuso. O `@IsDateString()` do DTO aceita essa forma, mas o
 * Prisma exige ISO-8601 completo para `DateTime` e recusava com
 * "Invalid value for argument data_necessidade": a solicitacao nao salvava e a
 * tela recebia 500.
 *
 * O front passou a mandar ISO com fuso (convertido no navegador). Isto fica
 * como defesa: string vira `Date`, e string vazia vira `null` (limpar o campo).
 * Sem fuso, `new Date` usa o fuso do servidor — por isso a conversao certa e a
 * do navegador, e esta e so para nao derrubar a requisicao.
 */
export function comDataNecessidadeNormalizada<T extends Record<string, unknown>>(
  dados: T,
): Omit<T, 'data_necessidade'> & { data_necessidade?: unknown } {
  const valor = dados.data_necessidade;
  if (typeof valor !== 'string') return dados;

  const texto = valor.trim();
  return { ...dados, data_necessidade: texto ? new Date(texto) : null };
}
