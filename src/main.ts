import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose']
  });

  // Servir arquivos estáticos (uploads)
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  // ✅ CORS para integração com frontend
  app.enableCors({
    origin: [
      'http://localhost:5175',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
      'https://aupus-service.aupusenergia.com.br',
      'https://aupus-service-api.aupusenergia.com.br'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-xsrf-token'],
    preflightContinue: false, // Importante: deixa o NestJS lidar com o preflight
    optionsSuccessStatus: 204, // Alguns browsers antigos (IE11) tem problema com 200
    credentials: true,
  });

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
    }),
  );

  // ✅ Aplicar interceptor de resposta padrão
  app.useGlobalInterceptors(new ResponseInterceptor());

  // ✅ Aplicar filtro de exceções global
  app.useGlobalFilters(new HttpExceptionFilter());

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

  console.log(`🚀 API rodando em: http://localhost:${port}`);
  console.log(`📖 Swagger docs: http://localhost:${port}/api/docs`);
  console.log(`🔍 Teste de banco: http://localhost:${port}/api/v1/test-db`);
}

bootstrap();