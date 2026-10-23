import * as Sentry from '@sentry/nestjs';
import { semDadosPessoais } from './config/sentry-sem-dados-pessoais';

Sentry.init({
  dsn: 'https://92a540132941fa92bde316ead7e537e2@o4510981695537152.ingest.us.sentry.io/4510981705367552',
  // Sem cabeçalho (o Authorization), corpo nem IP do usuário no evento
  sendDefaultPii: false,
  beforeSend: semDadosPessoais,
  integrations: [
    Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
  ],
  enableLogs: true,
});
