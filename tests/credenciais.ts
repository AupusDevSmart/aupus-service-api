/**
 * As credenciais do admin que os testes e2e usam para entrar (SN-9).
 *
 * Vêm só do `tests/.env` (fora do git). Antes cada teste tinha a senha padrão
 * antiga escrita no código como valor de reserva, e o `tests/.env.example`
 * versionado também: o repo é público. Sem as duas variáveis o teste para com
 * a explicação, em vez de tentar uma senha que não vale mais.
 */
export function credenciaisDoAdmin(): { email: string; senha: string } {
  const email = process.env.ADMIN_EMAIL?.trim();
  const senha = process.env.ADMIN_PASSWORD;
  if (!email || !senha) {
    throw new Error('Defina ADMIN_EMAIL e ADMIN_PASSWORD no tests/.env (o modelo está em tests/.env.example)');
  }
  return { email, senha };
}
