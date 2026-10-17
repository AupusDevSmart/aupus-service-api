import type { NextFunction, Request, Response } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { configurarApp } from '../../configurar-app';
import { LimiteDeTentativasModule } from '../../core/modules/auth/limite-de-tentativas';
import { ExecucaoOSController } from './execucao-os.controller';
import { ExecucaoOSService } from './execucao-os.service';
import { AnexosOSService } from './anexos-os.service';

/**
 * O PDF e a conferência do código (SN-62) releem a OS inteira, e a conferência
 * soma os arquivos do disco: um laço de pedidos pesaria no disco de todos. 10
 * por minuto por pessoa. Pela rota de verdade, com o app do configurarApp; o
 * usuário entra por um middleware (aqui não há o guard do JWT).
 */
describe('limite do PDF e da conferência da OS (HTTP)', () => {
  const servico = {
    relatorio: jest.fn(async () => ({ os_id: 'OS1' })),
    conferirCodigo: jest.fn(async () => ({ confere: true })),
  };
  let app: NestExpressApplication;

  beforeEach(async () => {
    const modulo = await Test.createTestingModule({
      imports: [LimiteDeTentativasModule],
      controllers: [ExecucaoOSController],
      providers: [
        { provide: ExecucaoOSService, useValue: servico },
        { provide: AnexosOSService, useValue: {} },
      ],
    }).compile();
    app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
    app.use((req: Request & { user?: unknown }, _res: Response, next: NextFunction) => {
      req.user = { id: String(req.headers['x-usuario'] ?? 'U1'), role: 'proprietario' };
      next();
    });
    configurarApp(app);
    await app.init();
  });

  afterEach(() => app.close());

  const conferir = (usuario: string) =>
    request(app.getHttpServer()).get(`/api/v1/execucao-os/conferencia?codigo=${'a'.repeat(64)}`).set('X-Usuario', usuario);
  const relatorio = (usuario: string) => request(app.getHttpServer()).get('/api/v1/execucao-os/OS1/relatorio').set('X-Usuario', usuario);

  it('a 11ª conferência da mesma pessoa no minuto recebe 429; outra pessoa segue', async () => {
    for (let i = 0; i < 10; i++) await conferir('U1').expect(200);

    await conferir('U1').expect(429);
    await conferir('U2').expect(200);
  });

  it('o PDF tem o mesmo limite', async () => {
    for (let i = 0; i < 10; i++) await relatorio('U1').expect(200);

    await relatorio('U1').expect(429);
  });
});
