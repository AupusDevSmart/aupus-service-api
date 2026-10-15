import './instrument';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configurarApp } from './configurar-app';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as Sentry from '@sentry/nestjs';
import logger from './config/logger.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    bufferLogs: true,
  });

  configurarApp(app);

  const config = new DocumentBuilder()
    .setTitle('Sistema de Manutenção Industrial API')
    .setDescription('API completa para gestão de usuários, plantas, equipamentos e manutenção')
    .setVersion('1.0')
    .addTag('Sistema', 'Endpoints do sistema')
    .addTag('Usuários', 'Gestão de usuários')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);

  // Usar Pino logger para mensagens de inicialização
  logger.info(`🚀 API rodando em: http://localhost:${port}`);
  logger.info(`📖 Swagger docs: http://localhost:${port}/api/docs`);
  logger.info(`🔍 Teste de banco: http://localhost:${port}/api/v1/test-db`);
  logger.info(`📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);

  if (process.env.SENTRY_DSN) {
    logger.info('✅ Sentry ativo - Monitoramento de erros habilitado');
  } else {
    logger.warn('⚠️  Sentry não configurado - Defina SENTRY_DSN no .env');
  }
}

bootstrap().catch((error) => {
  logger.error({ error }, 'Erro fatal ao iniciar aplicação');
  Sentry.captureException(error);
  process.exit(1);
});