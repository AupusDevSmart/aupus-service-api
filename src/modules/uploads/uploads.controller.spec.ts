import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { UploadsController, arquivoDaPasta } from './uploads.controller';

/**
 * A rota pública de uploads só serve arquivo de dentro da pasta pedida. Antes,
 * `..%2F..%2Fpackage.json` (o Express decodifica para `../../package.json`)
 * servia qualquer arquivo do servidor, sem login — achado na revisão do SN-36.
 */
describe('uploads: só arquivo de dentro da pasta', () => {
  const PASTA = 'avatars';
  const NOME = 'teste-sn37-avatar.txt';
  const SUBPASTA = 'teste-sn37-subpasta';
  const raiz = resolve(process.cwd(), 'uploads', PASTA);

  beforeAll(() => {
    mkdirSync(join(raiz, SUBPASTA), { recursive: true });
    writeFileSync(join(raiz, NOME), 'ok');
  });

  afterAll(() => {
    rmSync(join(raiz, NOME), { force: true });
    rmSync(join(raiz, SUBPASTA), { recursive: true, force: true });
  });

  it('o arquivo da pasta é servido', () => {
    expect(arquivoDaPasta(PASTA, NOME)).toBe(join(raiz, NOME));
  });

  it.each([
    ['subindo com barra', '../../package.json'],
    ['subindo com contrabarra', '..\\..\\package.json'],
    ['subindo até o dump', '../../backups/backup_2026-02-03T19-38-09/usuarios.json'],
    ['caminho absoluto', resolve(process.cwd(), 'package.json')],
    ['outra pasta de uploads', `../tarefas/${NOME}`],
    ['ponto-ponto', '..'],
    ['ponto', '.'],
    ['vazio', ''],
  ])('%s: 404', (_caso, nome) => {
    expect(arquivoDaPasta(PASTA, nome)).toBeNull();
  });

  it('arquivo que não existe e pasta no lugar de arquivo: 404', () => {
    expect(arquivoDaPasta(PASTA, 'nao-existe.png')).toBeNull();
    expect(arquivoDaPasta(PASTA, SUBPASTA)).toBeNull();
  });
});

/**
 * A rota é pública e o upload aceitava qualquer extensão com o tipo declarado
 * pelo cliente: um `x.html` mandado como image/png era servido como text/html,
 * com script, na origem da API (revisão de segurança do SN-38). O arquivo sai
 * com CSP que não deixa nada rodar — e a `<img>` da tela não é afetada.
 */
describe('uploads: o arquivo servido não roda nada', () => {
  const PASTA = 'avatars';
  const NOME = 'teste-sn38-pagina.html';
  const raiz = resolve(process.cwd(), 'uploads', PASTA);

  beforeAll(() => {
    mkdirSync(raiz, { recursive: true });
    writeFileSync(join(raiz, NOME), '<script>alert(1)</script>');
  });
  afterAll(() => rmSync(join(raiz, NOME), { force: true }));

  it('sai com CSP sandbox, sem permissão de script', () => {
    const cabecalhos: Record<string, string> = {};
    const res = {
      setHeader: (nome: string, valor: string) => { cabecalhos[nome.toLowerCase()] = valor; },
      sendFile: jest.fn(),
      status: () => res,
      json: jest.fn(),
    };

    new UploadsController().serveAvatar(NOME, res as never);

    expect(res.sendFile).toHaveBeenCalled();
    expect(cabecalhos['content-security-policy']).toBe("default-src 'none'; sandbox");
  });
});
