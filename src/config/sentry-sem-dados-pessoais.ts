import type { ErrorEvent } from '@sentry/nestjs';

/**
 * O que sai do servidor para o Sentry (fora do país, de terceiro): o erro, a
 * rota e quem pediu (o id), nunca o que a pessoa mandou nem a credencial.
 *
 * Com o `sendDefaultPii: true` de antes, todo evento levava os cabeçalhos — o
 * `Authorization` com o JWT do usuário, e na rota do NexON o token de serviço,
 * que não expira — e o corpo do pedido, com nome, telefone e texto livre
 * (revisão de segurança da integração do NexON, 22/out/2026). O `beforeSend`
 * que apagava o cabeçalho estava num `initializeSentry()` que nada chamava.
 */
const CABECALHOS_QUE_NAO_SAEM = ['authorization', 'cookie', 'x-api-key'];

export function semDadosPessoais(evento: ErrorEvent): ErrorEvent {
  const pedido = evento.request;
  if (!pedido) return evento;
  if (pedido.headers) {
    for (const nome of Object.keys(pedido.headers)) {
      if (CABECALHOS_QUE_NAO_SAEM.includes(nome.toLowerCase())) delete pedido.headers[nome];
    }
  }
  delete pedido.data;
  delete pedido.cookies;
  return evento;
}

/**
 * Do corpo, só os nomes dos campos: dizem qual formulário falhou (e o campo que
 * o `forbidNonWhitelisted` recusou) sem levar o valor.
 */
export function camposDoCorpo(corpo: unknown): string[] | undefined {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return undefined;
  return Object.keys(corpo);
}
