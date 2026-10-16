import type { NextFunction, Request, Response } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { configurarApp } from '../../configurar-app';
import { LimiteDeTentativasModule } from '../../core/modules/auth/limite-de-tentativas';
import { ComentariosDaOSController } from './comentarios.controller';
import { ComentariosService } from './comentarios.service';

/**
 * Cada comentário avisa os envolvidos e quem programa (SN-48): um laço de
 * comentários encheria o sininho e o e-mail da equipe. 20 por minuto por conta.
 * Pela rota de verdade, com o app montado pelo configurarApp; o usuário entra
 * por um middleware (aqui não há o guard do JWT).
 */
describe('limite de comentários (HTTP)', () => {
  const servico = { comentar: jest.fn(async () => ({ id: 'C1' })) };
  let app: NestExpressApplication;

  beforeEach(async () => {
    const modulo = await Test.createTestingModule({
      imports: [LimiteDeTentativasModule],
      controllers: [ComentariosDaOSController],
      providers: [{ provide: ComentariosService, useValue: servico }],
    }).compile();
    app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
    app.use((req: Request & { user?: unknown }, _res: Response, next: NextFunction) => {
      req.user = { id: String(req.headers['x-usuario'] ?? 'U1'), role: 'operador' };
      next();
    });
    configurarApp(app);
    await app.init();
  });

  afterEach(() => app.close());

  const comentar = (usuario: string) =>
    request(app.getHttpServer()).post('/api/v1/execucao-os/OS1/comentarios').set('X-Usuario', usuario).send({ comentario: 'oi' });

  it('o 21º comentário da mesma conta no minuto recebe 429; outra conta segue', async () => {
    for (let i = 0; i < 20; i++) await comentar('U1').expect(201);

    await comentar('U1').expect(429);
    await comentar('U2').expect(201);
  });
});
