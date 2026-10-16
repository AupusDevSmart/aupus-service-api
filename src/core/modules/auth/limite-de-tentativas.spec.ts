import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import logger from '../../../config/logger.config';
import { configurarApp } from '../../../configurar-app';
import { UsuariosController } from '../usuarios/usuarios.controller';
import { UsuariosService } from '../usuarios/usuarios.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LimiteDeTentativasModule } from './limite-de-tentativas';

/**
 * Login, "esqueci a senha" e redefinição aceitavam tentativas sem fim (SN-38),
 * e o helmet estava no package.json sem ser aplicado. Pelas rotas de verdade
 * (o AuthController com o app montado pelo mesmo configurarApp do main.ts), com
 * o AuthService falso: aqui interessa quantas vezes a rota deixa tentar, não a
 * senha. Um app novo por teste, para os contadores não passarem de um para o
 * outro.
 */
describe('limite de tentativas e cabeçalhos (HTTP)', () => {
  const authService = {
    login: jest.fn(async () => {
      throw new UnauthorizedException('Credenciais inválidas');
    }),
    refreshToken: jest.fn(async () => ({ access_token: 'novo' })),
    forgotPassword: jest.fn(async () => ({ message: 'Se o e-mail existir, enviamos o link.' })),
    resetPassword: jest.fn(async () => ({ message: 'Senha redefinida.' })),
  };
  const usuariosService = {
    changePassword: jest.fn(async () => {
      throw new BadRequestException('Senha atual incorreta');
    }),
  };
  let app: NestExpressApplication;

  beforeEach(async () => {
    const modulo = await Test.createTestingModule({
      imports: [LimiteDeTentativasModule],
      controllers: [AuthController, UsuariosController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UsuariosService, useValue: usuariosService },
      ],
    }).compile();
    app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
    configurarApp(app);
    await app.init();
  });

  afterEach(() => app.close());

  const login = (email: string, ip = '10.0.0.1') =>
    request(app.getHttpServer()).post('/api/v1/auth/login').set('X-Forwarded-For', ip).send({ email, senha: 'errada123' });
  const esqueci = (email: string, ip = '10.0.0.1') =>
    request(app.getHttpServer()).post('/api/v1/auth/forgot-password').set('X-Forwarded-For', ip).send({ email });

  it('o 7º login errado da mesma conta no minuto recebe 429, com a mensagem em português', async () => {
    for (let i = 0; i < 6; i++) await login('ana@teste.com').expect(401);

    const setima = await login('ana@teste.com').expect(429);

    expect(setima.body.error).toMatchObject({ code: 'TOO_MANY_REQUESTS', message: expect.stringContaining('Muitas tentativas') });
  });

  // O 429 sai do guard antes do interceptor de log e não vai para o Sentry:
  // força bruta não deixava rastro nenhum (revisão).
  it('o 429 fica no log com o IP e a rota, sem o e-mail', async () => {
    const avisar = jest.spyOn(logger, 'warn');
    for (let i = 0; i < 7; i++) await login('ana@teste.com', '10.0.9.9');

    const doLimite = avisar.mock.calls.filter(([, msg]) => msg === 'Limite de tentativas');
    expect(doLimite).toHaveLength(1);
    expect(doLimite[0][0]).toMatchObject({ ip: '10.0.9.9', rota: '/api/v1/auth/login' });
    expect(JSON.stringify(doLimite[0])).not.toContain('ana@teste.com');
    avisar.mockRestore();
  });

  it('a mesma conta escrita com outra caixa conta junto', async () => {
    for (let i = 0; i < 6; i++) await login(i % 2 ? 'ANA@teste.com' : 'ana@TESTE.com').expect(401);

    await login('Ana@Teste.com').expect(429);
  });

  it('outra conta no mesmo IP continua podendo tentar', async () => {
    for (let i = 0; i < 6; i++) await login('ana@teste.com');

    await login('bruno@teste.com').expect(401);
  });

  it('a mesma conta de outro IP continua podendo tentar', async () => {
    for (let i = 0; i < 6; i++) await login('ana@teste.com', '10.0.0.1');

    await login('ana@teste.com', '10.0.0.2').expect(401);
  });

  it('o mesmo IP tentando muitas contas para no limite por IP', async () => {
    for (let i = 0; i < 30; i++) await login(`conta${i}@teste.com`).expect(401);

    await login('mais-uma@teste.com').expect(429);
  });

  it('o X-Forwarded-For só vale vindo do proxy da própria máquina', () => {
    const express = app.getHttpAdapter().getInstance() as { get(nome: string): (endereco: string, salto: number) => boolean };
    const confia = express.get('trust proxy fn');

    expect(confia('127.0.0.1', 0)).toBe(true);
    expect(confia('::1', 0)).toBe(true);
    expect(confia('203.0.113.7', 0)).toBe(false);
  });

  it('esqueci a senha: a 4ª da mesma conta em 10 minutos recebe 429', async () => {
    for (let i = 0; i < 3; i++) await esqueci('ana@teste.com').expect(200);

    await esqueci('ana@teste.com').expect(429);
  });

  // Cada pedido troca o token e mata o link anterior: de IPs diferentes dava
  // para manter o link da vítima morrendo e encher a caixa dela (revisão).
  it('esqueci a senha: a 6ª da mesma conta na hora, mesmo de IPs diferentes, recebe 429', async () => {
    for (let i = 1; i <= 5; i++) await esqueci('ana@teste.com', `10.0.1.${i}`).expect(200);

    await esqueci('ana@teste.com', '10.0.1.99').expect(429);
  });

  it('o login não conta só pelo e-mail: de outros IPs ninguém tranca a conta alheia', async () => {
    for (let i = 1; i <= 10; i++) await login('ana@teste.com', `10.0.2.${i}`).expect(401);
  });

  it('IPv6 do mesmo /64 conta como o mesmo lugar', async () => {
    for (let i = 1; i <= 6; i++) await login('ana@teste.com', `2001:db8::${i}`).expect(401);

    await login('ana@teste.com', '2001:db8::99').expect(429);
  });

  it('a resposta não conta quantas tentativas sobram', async () => {
    const resposta = await login('ana@teste.com');

    expect(Object.keys(resposta.headers).filter((h) => /ratelimit|retry-after/i.test(h))).toEqual([]);
  });

  // Pede login, mas comparava a senha atual sem limite: com um token roubado,
  // dava para descobrir a senha e usá-la onde ela se repete (revisão).
  it('trocar a senha: a 6ª tentativa na mesma conta em 10 minutos recebe 429, de qualquer IP', async () => {
    const trocar = (ip: string) =>
      request(app.getHttpServer())
        .patch('/api/v1/usuarios/u1/change-password')
        .set('X-Forwarded-For', ip)
        .send({ senhaAtual: 'errada123', novaSenha: 'NovaSenha123' });
    for (let i = 1; i <= 5; i++) await trocar(`10.0.3.${i}`).expect(400);

    await trocar('10.0.3.99').expect(429);
  });

  it('redefinir a senha: a 6ª da mesma conta em 10 minutos recebe 429', async () => {
    const redefinir = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .set('X-Forwarded-For', '10.0.0.1')
        .send({ email: 'ana@teste.com', token: 'abc', novaSenha: 'NovaSenha123', confirmarSenha: 'NovaSenha123' });
    for (let i = 0; i < 5; i++) await redefinir().expect((r) => expect(r.status).not.toBe(429));

    await redefinir().expect(429);
  });

  it('o refresh aguenta o uso do front (120 por minuto por IP) e para depois', async () => {
    const renovar = () => request(app.getHttpServer()).post('/api/v1/auth/refresh').set('X-Forwarded-For', '10.0.7.7').send({ refresh_token: 'x' });
    for (let i = 0; i < 120; i++) await renovar().expect(200);

    await renovar().expect(429);
    // Outro IP (outra rede) segue renovando
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('X-Forwarded-For', '10.0.7.8').send({ refresh_token: 'x' }).expect(200);
  });

  it('os cabeçalhos do helmet saem, com o CORP liberando o front de outro domínio', async () => {
    const resposta = await login('ana@teste.com');

    expect(resposta.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'strict-transport-security': expect.stringContaining('max-age='),
      'content-security-policy': expect.stringContaining("default-src 'self'"),
      'cross-origin-resource-policy': 'cross-origin',
    });
    expect(resposta.headers['x-powered-by']).toBeUndefined();
  });
});
