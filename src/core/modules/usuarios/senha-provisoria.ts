import { randomInt } from 'crypto';

/** Sem caracteres que se confundem ao ler (0/O, 1/l/I). */
const CARACTERES = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Senha provisória de um usuário novo ou com a senha redefinida (SN-34): 12
 * caracteres com maiúscula, minúscula e número, sorteados com o gerador do
 * sistema. Antes era sempre "Aupus123!", para todo mundo.
 */
export function gerarSenhaProvisoria(tamanho = 12): string {
  for (;;) {
    let senha = '';
    for (let i = 0; i < tamanho; i++) senha += CARACTERES[randomInt(CARACTERES.length)];
    if (/[a-z]/.test(senha) && /[A-Z]/.test(senha) && /[0-9]/.test(senha)) return senha;
  }
}
