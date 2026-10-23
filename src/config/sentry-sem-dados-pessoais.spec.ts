import type { ErrorEvent } from '@sentry/nestjs';
import { camposDoCorpo, semDadosPessoais } from './sentry-sem-dados-pessoais';

/**
 * O evento do Sentry sai do servidor: nem credencial nem o que a pessoa mandou.
 * Antes iam o JWT do usuário (e o token de serviço do NexON) no cabeçalho e o
 * corpo inteiro, com nome, telefone e texto livre.
 */
describe('semDadosPessoais', () => {
  it('tira Authorization, cookie e chave de API em qualquer caixa, e deixa o resto', () => {
    const evento = semDadosPessoais({
      type: undefined,
      request: {
        headers: { Authorization: 'Bearer abc', cookie: 'sessao=1', 'X-Api-Key': 'k', 'user-agent': 'axios' },
        cookies: { sessao: '1' },
        data: { nome: 'Ana', telefone: '+5562999990000' },
        url: '/api/v1/solicitacoes-servico',
      },
    } as ErrorEvent);
    expect(evento.request).toEqual({ headers: { 'user-agent': 'axios' }, url: '/api/v1/solicitacoes-servico' });
  });

  it('evento sem pedido passa como veio', () => {
    const evento = { type: undefined, message: 'cron' } as ErrorEvent;
    expect(semDadosPessoais(evento)).toBe(evento);
  });
});

describe('camposDoCorpo', () => {
  it('só os nomes dos campos, nunca o valor', () => {
    expect(camposDoCorpo({ senhaAtual: 'a', nome: 'Ana', itens: [{ x: 1 }] })).toEqual(['senhaAtual', 'nome', 'itens']);
  });

  it('o que não é objeto não vira campo', () => {
    expect(camposDoCorpo(undefined)).toBeUndefined();
    expect(camposDoCorpo('texto')).toBeUndefined();
    expect(camposDoCorpo([{ senha: '1' }])).toBeUndefined();
  });
});
