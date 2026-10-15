import { semSegredos } from './logging.interceptor';

/**
 * O corpo que vai para o log e para o Sentry não leva segredo, em nenhuma
 * grafia nem profundidade. Antes só `senha`/`password`/`token` exatos eram
 * mascarados: a troca de senha mandava `senhaAtual` e `novaSenha` abertas.
 */
describe('semSegredos', () => {
  it('mascara toda chave de segredo, em qualquer grafia', () => {
    expect(
      semSegredos({ senhaAtual: 'a', novaSenha: 'b', confirmarSenha: 'c', refresh_token: 'd', accessToken: 'e', Password: 'f', email: 'x@y' }),
    ).toEqual({
      senhaAtual: '***REDACTED***',
      novaSenha: '***REDACTED***',
      confirmarSenha: '***REDACTED***',
      refresh_token: '***REDACTED***',
      accessToken: '***REDACTED***',
      Password: '***REDACTED***',
      email: 'x@y',
    });
  });

  it('desce em objeto e lista', () => {
    expect(semSegredos({ usuarios: [{ nome: 'Ana', senha: '1' }], dados: { token: '2', n: 3 } })).toEqual({
      usuarios: [{ nome: 'Ana', senha: '***REDACTED***' }],
      dados: { token: '***REDACTED***', n: 3 },
    });
  });

  it('valor que não é objeto passa como veio', () => {
    expect(semSegredos(undefined)).toBeUndefined();
    expect(semSegredos('texto')).toBe('texto');
  });
});
