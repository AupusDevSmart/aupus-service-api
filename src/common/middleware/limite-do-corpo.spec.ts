import { request as pedidoHttp } from 'http';
import type { AddressInfo } from 'net';
import { gzipSync } from 'zlib';
import { Controller, HttpCode, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FileInterceptor, NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { configurarApp } from '../../configurar-app';
import { NotificacoesController } from '../../modules/notificacoes/notificacoes.controller';
import { NotificacoesService } from '../../modules/notificacoes/notificacoes.service';
import { LimitesDoUploadModule } from '../upload/limites-do-upload.module';
import { excessoNosBytes } from './limite-do-corpo';

/** Um upload qualquer, só para o multer rodar com os limites globais. */
@Controller('teste-upload')
class UploadDeTeste {
  @Post()
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('arquivo'))
  receber(@UploadedFile() arquivo?: Express.Multer.File) {
    return { recebido: Boolean(arquivo) };
  }
}

/**
 * O limite global do corpo era de 20 MB para toda rota, e o class-transformer
 * e o class-validator só olham o tamanho depois de instanciar campo por campo
 * (revisões do SN-47 e do SN-50, medidas):
 *   - 3 MB de `[{},{},...]`: ~8 s de event loop parado e 1,6 GB;
 *   - 1 MB de `{"k0":0,"k1":0,...}` no login, sem conta: 13 s (filtro quadrático de chaves);
 *   - gzip/brotli: 105 kB viravam 2,5 MB e passavam do limite;
 *   - anônimo na importação: 20 MB lidos antes do 401;
 *   - 2 MB de `[[[[...`: o próprio JSON.parse levava 1,5 s, sem login.
 * Pelas rotas de verdade, com o app montado pelo mesmo configurarApp do main.ts.
 */
describe('limite do corpo (HTTP)', () => {
  const segredoAnterior = process.env.JWT_SECRET;
  const servico = { salvarPreferencias: jest.fn() };
  let app: NestExpressApplication;
  let token: string;
  let semPermissao: string;
  let renovacao: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'apenas-para-este-teste'; // segredo-ok
    const assinar = (conteudo: object) => new JwtService().sign(conteudo, { secret: process.env.JWT_SECRET, expiresIn: '5m' });
    token = assinar({ sub: 'x', permissions: ['recursos.manage'] });
    semPermissao = assinar({ sub: 'x', permissions: ['solicitacoes.create'] });
    renovacao = assinar({ sub: 'x', type: 'refresh' });
    const modulo = await Test.createTestingModule({
      imports: [LimitesDoUploadModule],
      controllers: [NotificacoesController, UploadDeTeste],
      providers: [{ provide: NotificacoesService, useValue: servico }],
    }).compile();
    app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
    configurarApp(app);
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
    process.env.JWT_SECRET = segredoAnterior;
  });

  /**
   * Só os cabeçalhos, com o tamanho declarado: a API decide antes de ler o
   * corpo, e o supertest, mandando megabytes que ninguém lê, levaria ECONNRESET.
   */
  const declarando = (rota: string, bytes: number, tipo: string, extra: Record<string, string> = {}) =>
    new Promise<number>((ok, falha) => {
      const porta = (app.getHttpServer().address() as AddressInfo | null)?.port;
      const pedido = pedidoHttp(
        { host: '127.0.0.1', port: porta, path: rota, method: 'POST', headers: { 'Content-Type': tipo, 'Content-Length': bytes, ...extra } },
        (resposta) => {
          ok(resposta.statusCode ?? 0);
          pedido.destroy();
        },
      );
      pedido.on('error', (erro: NodeJS.ErrnoException) => (erro.code === 'ECONNRESET' ? undefined : falha(erro)));
      pedido.write('{');
    });

  const enviar = (rota: string, corpo: unknown, comLogin = false) => {
    const pedido = request(app.getHttpServer()).put(rota).set('Content-Type', 'application/json');
    return (comLogin ? pedido.set('Authorization', `Bearer ${token}`) : pedido).send(JSON.stringify(corpo));
  };
  const vazios = (n: number) => Array.from({ length: n }, () => ({}));
  /** Itens com texto: muitos bytes com poucos itens. */
  const pesados = (n: number, bytes: number) => Array.from({ length: n }, () => ({ texto: 'x'.repeat(bytes) }));
  const largo = (chaves: number) => Object.fromEntries(Array.from({ length: chaves }, (_, i) => [`k${i}`, 0]));

  describe('notificações (32 kB)', () => {
    it('corpo grande é recusado pelo tamanho, sem chegar à validação', async () => {
      const resposta = await enviar('/api/v1/notificacoes/preferencias', { preferencias: vazios(20_000) }).expect(413);

      expect(resposta.body.error).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
      expect(servico.salvarPreferencias).not.toHaveBeenCalled();
    });

    it('corpo pequeno passa do limite e chega à validação', async () => {
      const resposta = await enviar('/api/v1/notificacoes/preferencias', { preferencias: 'x' }).expect(400);

      expect(resposta.body.success).toBe(false);
    });
  });

  describe('qualquer rota (2 MB de JSON, listas curtas, objetos estreitos)', () => {
    // As rotas abaixo não existem neste app: 404 prova que o pedido passou dos limites
    it('JSON acima de 2 MB é recusado pelo tamanho, sem ler o corpo', async () => {
      expect(await declarando('/api/v1/outra-rota', 3 * 1024 * 1024, 'application/json')).toBe(413);
    });

    it('JSON de até 2 MB passa do tamanho', async () => {
      await enviar('/api/v1/outra-rota', { lista: pesados(150, 10_000) }).expect(404);
    });

    it('corpo compactado é recusado, no envelope da API: descompactado passaria do limite', async () => {
      const compactado = gzipSync(JSON.stringify({ lista: vazios(1_000) }));
      const resposta = await request(app.getHttpServer())
        .put('/api/v1/outra-rota')
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'gzip')
        .send(compactado)
        .expect(415);

      expect(resposta.body).toMatchObject({ success: false, error: { code: 'UNSUPPORTED_MEDIA_TYPE' } });
    });

    it('JSON em UTF-16 é recusado (a contagem nos bytes vale só para UTF-8)', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/outra-rota')
        .set('Content-Type', 'application/json; charset=utf-16le')
        .send(Buffer.from('{"a":1}', 'utf16le'))
        .expect(415);
    });

    it('2 MB de colchetes aninhados são recusados antes do JSON.parse, rápido', async () => {
      const inicio = Date.now();
      const resposta = await request(app.getHttpServer())
        .put('/api/v1/outra-rota')
        .set('Content-Type', 'application/json')
        .send('['.repeat(1_000_000) + ']'.repeat(1_000_000))
        .expect(413);

      expect(resposta.body.error.message).toContain('aninhamento');
      expect(Date.now() - inicio).toBeLessThan(1_000);
    });

    it('vírgula e colchete dentro de texto não contam', async () => {
      await enviar('/api/v1/outra-rota', { texto: ',[{'.repeat(50_000) }).expect(404);
    });

    it('lista com mais de 2.000 itens é recusada antes da validação, mesmo pequena em bytes', async () => {
      const resposta = await enviar('/api/v1/outra-rota', { lista: vazios(3_000) }).expect(413);

      expect(resposta.body.error.message).toContain('mais de 2000 itens');
    });

    it('objeto com campos demais é recusado (o filtro de chaves do class-transformer é quadrático)', async () => {
      const resposta = await enviar('/api/v1/auth/login', largo(5_000)).expect(413);

      expect(resposta.body.error.message).toContain('mais de 200 campos');
    });

    it('objeto largo escondido dentro de outro também', async () => {
      await enviar('/api/v1/outra-rota', { x: { y: largo(300) } }).expect(413);
    });

    it('nós demais no total, mesmo com cada lista e objeto dentro do teto', async () => {
      const resposta = await enviar('/api/v1/outra-rota', { a: Array.from({ length: 150 }, () => largo(150)) }).expect(413);

      expect(resposta.body.error.message).toContain('no total');
    });

    it('pedido normal passa', async () => {
      await enviar('/api/v1/outra-rota', { lista: pesados(500, 100), campo: largo(60) }).expect(404);
    });
  });

  describe('upload (multipart)', () => {
    it('arquivo maior que 2 MB não é barrado pelo limite do JSON', async () => {
      expect(await declarando('/api/v1/outra-rota', 3 * 1024 * 1024, 'multipart/form-data; boundary=x')).toBe(404);
    });

    it('upload com poucos campos passa', async () => {
      await request(app.getHttpServer()).post('/api/v1/teste-upload').field('tipo', 'FOTO').attach('arquivo', Buffer.from('x'), 'a.jpg').expect(200);
    });

    it('upload com campos de texto demais é recusado pelo multer', async () => {
      let pedido = request(app.getHttpServer()).post('/api/v1/teste-upload');
      for (let i = 0; i < 80; i++) pedido = pedido.field(`k${i}`, '0');
      const resposta = await pedido.attach('arquivo', Buffer.from('x'), 'a.jpg');

      expect(resposta.status).toBeGreaterThanOrEqual(400);
      expect(resposta.status).toBeLessThan(500);
    });
  });

  describe('importação (20 MB, até 5.000 registros, só com login)', () => {
    it('sem token não lê o corpo', async () => {
      expect(await declarando('/api/v1/importacao/recursos', 15 * 1024 * 1024, 'application/json')).toBe(401);
    });

    it('token de renovação não serve', async () => {
      expect(await declarando('/api/v1/importacao/recursos', 15 * 1024 * 1024, 'application/json', { Authorization: `Bearer ${renovacao}` })).toBe(401);
    });

    it('token de quem não pode importar não serve', async () => {
      expect(await declarando('/api/v1/importacao/recursos', 15 * 1024 * 1024, 'application/json', { Authorization: `Bearer ${semPermissao}` })).toBe(401);
    });

    it('token inválido também não', async () => {
      expect(await declarando('/api/v1/importacao/recursos', 15 * 1024 * 1024, 'application/json', { Authorization: 'Bearer abc.def.ghi' })).toBe(401);
    });

    it('com token, planilha acima de 2 MB passa', async () => {
      await enviar('/api/v1/importacao/recursos', { registros: pesados(300, 10_000) }, true).expect(404);
    });

    it('5.000 registros passam; 5.001 não', async () => {
      await enviar('/api/v1/importacao/recursos', { registros: vazios(5_000) }, true).expect(404);
      await enviar('/api/v1/importacao/recursos', { registros: vazios(5_001) }, true).expect(413);
    });

    it('o prefixo não vale para rota que só começa parecido', async () => {
      await enviar('/api/v1/importacaox', { registros: vazios(3_000) }, true).expect(413);
    });
  });
});

describe('excessoNosBytes', () => {
  const teto = { porLista: 10, porObjeto: 5, total: 25 };
  const nos = (corpo: unknown, t = teto) => excessoNosBytes(Buffer.from(JSON.stringify(corpo)), t);

  it('dentro do teto, nada', () => {
    expect(nos({ a: [1, 2, 3], b: { c: [{ d: [1] }] }, e: [], f: {} })).toBeNull();
  });

  it('lista aninhada longa demais', () => {
    expect(nos({ a: { b: [{ c: Array(11).fill(0) }] } })).toContain('mais de 10 itens');
  });

  it('objeto largo demais', () => {
    expect(nos({ a: [{ k1: 0, k2: 0, k3: 0, k4: 0, k5: 0, k6: 0 }] })).toContain('mais de 5 campos');
  });

  it('soma de itens e campos', () => {
    expect(nos({ a: Array(9).fill(0), b: Array(9).fill(0), c: Array(9).fill(0) })).toContain('no total');
  });

  it('o que está dentro de texto, inclusive aspas escapadas, não conta', () => {
    expect(nos({ a: 'x,y,z,[,{,},]'.repeat(50), b: 'aspas \\" , , , dentro' })).toBeNull();
  });

  it('aninhamento fundo demais', () => {
    expect(excessoNosBytes(Buffer.from('['.repeat(100) + ']'.repeat(100)), teto)).toContain('aninhamento');
  });

  it('conta igual ao corpo montado: 10 itens passam, 11 não', () => {
    expect(nos({ a: Array(10).fill({}) }, { porLista: 10, porObjeto: 5, total: 100 })).toBeNull();
    expect(nos({ a: Array(11).fill({}) }, { porLista: 10, porObjeto: 5, total: 100 })).toContain('mais de 10');
  });
});
