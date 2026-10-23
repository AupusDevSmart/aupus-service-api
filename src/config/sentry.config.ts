import * as Sentry from '@sentry/node';

/**
 * O Sentry se inicia em `src/instrument.ts` (o primeiro import do `main.ts`),
 * com o `beforeSend` que tira credencial e corpo do evento. Aqui fica só o
 * reexport usado pelo interceptor e pelos helpers de monitoramento: o
 * `initializeSentry()` que existia aqui nunca era chamado, e o filtro de
 * cabeçalho dele não valia para nada.
 */
export { Sentry };
