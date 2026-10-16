import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { configurarApp } from '../../configurar-app';
import { NotificacoesController } from '../../modules/notificacoes/notificacoes.controller';
import { NotificacoesService } from '../../modules/notificacoes/notificacoes.service';

/**
 * O PUT das preferências é aberto a qualquer logado, e o limite global do
 * corpo é de 20 MB: 3 MB de `[{},{},...]` travavam a API por ~8 s antes de o
 * class-validator recusar a lista (revisão do SN-47). Pela rota de verdade,
 * com o app montado pelo mesmo configurarApp do main.ts.
 */
describe('limite do corpo das notificações (HTTP)', () => {
  const servico = { salvarPreferencias: jest.fn() };
  let app: NestExpressApplication;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [NotificacoesController],
      providers: [{ provide: NotificacoesService, useValue: servico }],
    }).compile();
    app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
    configurarApp(app);
    await app.init();
  });

  afterAll(() => app.close());

  const put = () => request(app.getHttpServer()).put('/api/v1/notificacoes/preferencias').set('Content-Type', 'application/json');

  it('corpo grande é recusado pelo tamanho, sem chegar à validação', async () => {
    const lista = JSON.stringify({ preferencias: Array.from({ length: 20_000 }, () => ({})) });

    const resposta = await put().send(lista).expect(413);

    expect(resposta.body.error).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    expect(servico.salvarPreferencias).not.toHaveBeenCalled();
  });

  it('corpo pequeno passa do limite e chega à validação', async () => {
    const resposta = await put().send({ preferencias: 'x' }).expect(400);

    expect(resposta.body.success).toBe(false);
  });

  it('a mesma lista grande noutra rota não é barrada por este limite', async () => {
    // A rota não existe aqui: 404, não 413 — o limite vale só para /notificacoes
    await request(app.getHttpServer())
      .put('/api/v1/outra-rota')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ lista: Array.from({ length: 20_000 }, () => ({})) }))
      .expect(404);
  });
});
