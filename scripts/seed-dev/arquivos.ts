import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * As pastas em que os services do seed gravam (fotos da OS, da anomalia e o
 * esquema da instrução). O banco desfaz na prévia ou na falha; o disco, não:
 * o seed lembra o que havia antes e tira só o que ele mesmo gravou.
 */
const PASTAS = ['uploads/anexos-os', 'uploads/anexos', 'uploads/instrucoes/anexos'];

export function arquivosDeUpload(): Set<string> {
  const vistos = new Set<string>();
  for (const pasta of PASTAS) {
    const dir = path.join(process.cwd(), pasta);
    if (!fs.existsSync(dir)) continue;
    for (const nome of fs.readdirSync(dir)) vistos.add(path.join(dir, nome));
  }
  return vistos;
}

/**
 * Tira o que o seed gravou. Nunca lança: roda no caminho da falha, e um
 * arquivo preso (antivírus, indexador do Windows) não pode trocar o erro de
 * verdade pelo dele. O que não saiu volta nomeado, para apagar à mão.
 */
export function apagarOsNovos(antes: Set<string>): { apagados: number; presos: string[] } {
  let apagados = 0;
  const presos: string[] = [];
  for (const arquivo of arquivosDeUpload()) {
    if (antes.has(arquivo)) continue;
    try {
      fs.unlinkSync(arquivo);
      apagados++;
    } catch {
      presos.push(arquivo);
    }
  }
  return { apagados, presos };
}

/** Como o dotenv: entre aspas vale o que está dentro; sem aspas, o " #" começa um comentário */
function valorDoEnv(cru: string): string {
  const aspas = cru.match(/^(["'])(.*)\1(\s+#.*)?$/);
  if (aspas) return aspas[2];
  return cru.replace(/\s+#.*$/, '');
}

/** Lê do .env da API as chaves pedidas, sem sobrescrever o ambiente nem imprimir valor */
export function lerDoEnv(chaves: string[]): void {
  const arquivo = path.join(process.cwd(), '.env');
  if (!fs.existsSync(arquivo)) return;
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || !chaves.includes(m[1]) || process.env[m[1]]) continue;
    process.env[m[1]] = valorDoEnv(m[2]);
  }
}
