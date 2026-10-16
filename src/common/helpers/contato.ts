/**
 * Telefone num formato só: E.164 (`+5562999998888`), como o WhatsApp e
 * qualquer envio por número esperam (SN-46). Aceita o que as pessoas digitam
 * — com ou sem máscara, com ou sem +55, com o 0 da operadora — e devolve
 * `null` para o que não é telefone.
 *
 * Brasil (o padrão, sem código do país):
 * - 10 dígitos: DDD + fixo;
 * - 11 dígitos: DDD + celular, que começa com 9.
 * Outro país: `+` (ou `00`) e de 8 a 15 dígitos.
 */
export function telefoneE164(texto: string): string | null {
  const limpo = texto.trim();
  const digitos = limpo.replace(/\D/g, '');
  if (!digitos) return null;

  if (limpo.startsWith('+')) return internacional(digitos);
  if (digitos.startsWith('00')) return internacional(digitos.slice(2));

  // 55 + DDD + número (12 ou 13 dígitos)
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) return brasileiro(digitos.slice(2));
  // 0 da operadora + DDD + número
  if ((digitos.length === 11 || digitos.length === 12) && digitos.startsWith('0')) return brasileiro(digitos.slice(1));
  return brasileiro(digitos);
}

function internacional(digitos: string): string | null {
  if (digitos.startsWith('55')) return brasileiro(digitos.slice(2));
  return /^[1-9]\d{7,14}$/.test(digitos) ? `+${digitos}` : null;
}

/** DDD (11 a 99, sem zero) + fixo de 8 dígitos ou celular de 9 começando em 9. */
function brasileiro(nacional: string): string | null {
  const valido = /^[1-9][1-9](?:\d{8}|9\d{8})$/.test(nacional);
  return valido ? `+55${nacional}` : null;
}

/** E-mail sem espaço nas pontas e sem caixa: é o login, e `Ana@` e `ana@` são a mesma pessoa. */
export function normalizarEmail(valor: unknown): unknown {
  return typeof valor === 'string' ? valor.trim().toLowerCase() : valor;
}
