import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { arquivoDaPasta } from './uploads.controller';

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
