const normalizar = (v: unknown) => {
  if (typeof v === 'string') return v.trim() || null;
  if (v === undefined) return null;
  // Decimal do Prisma (latitude, valores): compara como número.
  if (v && typeof v === 'object' && 'toNumber' in v && typeof v.toNumber === 'function') return v.toNumber();
  return v;
};

/**
 * Tira do payload os campos iguais ao que já está gravado.
 *
 * A planilha manda a linha inteira, e o DTO valida tudo o que recebe. Um dado
 * antigo, gravado antes de uma regra de hoje (telefone de 8 dígitos, e-mail
 * sem domínio), reprovaria a linha inteira mesmo sem ninguém ter mexido nele —
 * e reimportar sem mexer daria erro. Campo que não mudou não muda nada no
 * banco; tirá-lo só evita revalidar o que a planilha não está alterando.
 *
 * `colunas`: campo do payload → coluna do registro (`cpfCnpj` → `cpf_cnpj`).
 */
export function semOQueNaoMudou<T extends object>(
  dados: Record<string, unknown>,
  atual: T | null,
  colunas: Record<string, keyof T>,
): Record<string, unknown> {
  if (!atual) return dados;

  const resto = { ...dados };
  for (const [campo, coluna] of Object.entries(colunas)) {
    if (campo in resto && normalizar(resto[campo]) === normalizar(atual[coluna])) delete resto[campo];
  }
  return resto;
}
