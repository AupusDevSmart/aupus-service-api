import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { exceptionFactoryEmPortugues } from './common/pipes/mensagens-validacao';
import { JwtService } from '@nestjs/jwt';
import { erroDoParserNoEnvelope, limiteDoCorpo, loginAntesDoCorpo, verificarAntesDoParse } from './common/middleware/limite-do-corpo';
import { PERMISSIONS_KEY } from './core/modules/auth/decorators/permissions.decorator';
import { ImportacaoController } from './modules/importacao/importacao.controller';

const IMPORTACAO = '/api/v1/importacao';
const jwt = new JwtService();

/** As permissões das rotas de importação, lidas dos próprios @Permissions: não há lista a manter. */
function permissoesDaImportacao(): Set<string> {
  const prototipo = ImportacaoController.prototype as unknown as Record<string, unknown>;
  return new Set(
    Object.getOwnPropertyNames(prototipo).flatMap((metodo) => (Reflect.getMetadata(PERMISSIONS_KEY, prototipo[metodo] as object) as string[] | undefined) ?? []),
  );
}
const PODE_IMPORTAR = permissoesDaImportacao();

/**
 * Token de acesso (não o de renovação, de 7 dias) de quem tem alguma permissão
 * de importar: só então os 20 MB são lidos. As permissões do token são as do
 * login e estão assinadas; o guard confere as de agora depois. O segredo é lido
 * na hora: o ConfigModule carrega o .env depois deste arquivo ser importado.
 */
const podeMandarPlanilha = (token: string) => {
  try {
    const conteudo = jwt.verify<{ type?: string; permissions?: unknown }>(token, { secret: process.env.JWT_SECRET });
    if (conteudo.type === 'refresh') return false;
    return Array.isArray(conteudo.permissions) && conteudo.permissions.some((nome) => PODE_IMPORTAR.has(String(nome)));
  } catch {
    return false;
  }
};

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

  // Tamanho do corpo, antes do parser montar o JSON (SN-47, SN-50): as
  // notificações só recebem pedido pequeno; o resto, 2 MB de JSON (o maior
  // registro sincronizado com o NexOn tem ~1,3 kB); só a importação, 20 MB.
  app.use('/api/v1/notificacoes', limiteDoCorpo(32 * 1024));
  app.use(limiteDoCorpo(2 * 1024 * 1024, { soJson: true, exceto: [IMPORTACAO] }));
  // Os 20 MB da importação só são lidos para quem pode importar
  app.use(IMPORTACAO, loginAntesDoCorpo(podeMandarPlanilha));

  // O padrão do body-parser (100 kB) não cabe uma planilha de cadastro
  // importada: centenas de registros com as listas de cada um. Corpo
  // compactado é recusado (415): o limite acima confere o Content-Length, e
  // descompactado o pedido passaria dele. Navegador e NexOn não compactam.
  //
  // Lista longa, objeto largo, aninhamento ou nós demais: recusado nos bytes,
  // antes do JSON.parse (o verify roda antes dele). O maior DTO tem 101 campos;
  // a importação tem o teto do próprio DTO (5.000 registros)
  app.useBodyParser('json', {
    limit: '20mb',
    inflate: false,
    verify: verificarAntesDoParse(
      { porLista: 2_000, porObjeto: 200, total: 20_000 },
      { [IMPORTACAO]: { porLista: 5_000, porObjeto: 200, total: 2_000_000 } },
    ),
  });
  app.use(erroDoParserNoEnvelope);

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
