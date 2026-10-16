import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { exceptionFactoryEmPortugues } from './common/pipes/mensagens-validacao';
import { limiteDoCorpo } from './common/middleware/limite-do-corpo';

/**
 * Tudo o que o app recebe antes de ouvir a porta, menos o Swagger. Fica fora
 * do main.ts para os specs de HTTP montarem o app igual ao de produção
 * (prefixo, pipe, filtro de erro, cabeçalhos, IP atrás do proxy).
 */
export function configurarApp(app: NestExpressApplication): void {
  // O IP vem do X-Forwarded-For só quando a conexão chega pelo nginx da própria
  // máquina: quem chega direto à porta não forja o IP. O limite de tentativas
  // conta por esse IP (SN-38), então o nginx TEM de sobrescrever o cabeçalho em
  // todo location que faz proxy_pass (roteiro do deploy, item 5c). Se ele só
  // repassar o que o cliente mandou, o atacante escolhe o próprio IP a cada
  // pedido e o limite não segura nada; quem não manda o cabeçalho cai em
  // 127.0.0.1 e divide um contador só.
  app.set('trust proxy', 'loopback');

  // Cabeçalhos de segurança (SN-38: o helmet estava no package.json sem ser
  // aplicado). CORP cross-origin porque o front, noutro domínio, mostra foto e
  // anexo servidos por esta API; o padrão (same-origin) os bloquearia. Sem o
  // upgrade-insecure-requests da CSP: a API quase não serve documento, o HSTS
  // já obriga https, e com ele o Swagger aberto por http fora do localhost (IP
  // da rede, celular) não carregava os próprios arquivos.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
    }),
  );

  // Arquivo enviado é servido só pelo UploadsController (/api/v1/uploads/<pasta>/<nome>),
  // que confere a pasta (SN-40). O useStaticAssets('/uploads') que existia aqui
  // apontava para dist/uploads, que não existe, e não servia nada; com o
  // caminho "corrigido", serviria a pasta inteira (anexos de OS, documentos de
  // veículo) sem passar por essa conferência. Saiu no SN-38.

  // CORS: origens permitidas em CORS_ORIGIN (separadas por virgula). Vazio = reflete qualquer origem (dev).
  const corsOriginEnv = process.env.CORS_ORIGIN?.trim();
  const corsOrigin = corsOriginEnv
    ? corsOriginEnv.split(',').map((o) => o.trim()).filter(Boolean)
    : true;
  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-xsrf-token'],
    credentials: true,
  });

  // Antes do parser: as notificações só recebem pedido pequeno (SN-47)
  app.use('/api/v1/notificacoes', limiteDoCorpo(32 * 1024));

  // O padrão do body-parser (100 kB) não cabe uma planilha de cadastro
  // importada: centenas de registros com as listas de cada um.
  app.useBodyParser('json', { limit: '20mb' });

  // ✅ Prefix global da API
  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      // Sem isto o usuario recebia a frase crua do class-validator, em ingles
      // e com o nome da coluna: "tempo_estimado must not be less than 1".
      exceptionFactory: exceptionFactoryEmPortugues,
    }),
  );

  // ✅ Interceptors (ordem importa!)
  app.useGlobalInterceptors(new LoggingInterceptor()); // Primeiro: logging
  app.useGlobalInterceptors(new ResponseInterceptor()); // Segundo: formatação de resposta

  // ✅ Aplicar filtro de exceções global
  app.useGlobalFilters(new HttpExceptionFilter());
}
