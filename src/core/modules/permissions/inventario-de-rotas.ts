import * as fs from 'fs';
import * as path from 'path';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';

/**
 * Todas as rotas da API com a permissão que cada uma exige, lidas dos
 * metadados dos decorators (@Controller, @Get..., @Permissions, @Public) — o
 * mesmo que o PermissionsGuard lê. Não instancia nada: só importa as classes.
 *
 * Usado pelo teste da matriz de permissões (nenhuma rota fica sem regra por
 * esquecimento) e para documentar quem acessa o quê.
 */
export interface RotaInventariada {
  /** "GET /usuarios/:id" (sem o prefixo global /api/v1) */
  rota: string;
  controller: string;
  metodo: string;
  /** Qualquer uma basta (OR). Vazio = só estar logado. */
  permissoes: string[];
  publica: boolean;
  /** A classe e o método de verdade, para rodar o PermissionsGuard sobre eles. */
  classe: new (...args: never[]) => unknown;
  handler: (...args: never[]) => unknown;
}

const VERBO: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.ALL]: 'ALL',
  [RequestMethod.OPTIONS]: 'OPTIONS',
  [RequestMethod.HEAD]: 'HEAD',
};

const juntar = (...partes: (string | undefined)[]) =>
  '/' +
  partes
    .flatMap((p) => (p ?? '').split('/'))
    .filter(Boolean)
    .join('/');

function arquivosDeController(pasta: string): string[] {
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const caminho = path.join(pasta, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : arquivosDeController(caminho);
    return e.name.endsWith('.controller.ts') ? [caminho] : [];
  });
}

export function inventariarRotas(raiz = path.join(__dirname, '..', '..', '..')): RotaInventariada[] {
  const rotas: RotaInventariada[] = [];
  for (const arquivo of arquivosDeController(raiz)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const modulo = require(arquivo) as Record<string, unknown>;
    for (const exportado of Object.values(modulo)) {
      if (typeof exportado !== 'function') continue;
      const prefixo = Reflect.getMetadata(PATH_METADATA, exportado) as string | string[] | undefined;
      if (prefixo === undefined) continue;
      const classe = exportado as { name: string; prototype: Record<string, unknown> };
      const daClasse = (Reflect.getMetadata(PERMISSIONS_KEY, classe) as string[] | undefined) ?? [];
      const classePublica = !!Reflect.getMetadata(IS_PUBLIC_KEY, classe);

      for (const nome of Object.getOwnPropertyNames(classe.prototype)) {
        const handler = classe.prototype[nome];
        if (nome === 'constructor' || typeof handler !== 'function') continue;
        const caminho = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
        const verbo = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        if (caminho === undefined || verbo === undefined) continue;

        // getAllAndOverride: a do método vence a da classe
        const doMetodo = Reflect.getMetadata(PERMISSIONS_KEY, handler) as string[] | undefined;
        for (const p of [prefixo].flat()) {
          for (const c of [caminho].flat()) {
            rotas.push({
              rota: `${VERBO[verbo]} ${juntar(p, c)}`,
              controller: classe.name,
              metodo: nome,
              permissoes: doMetodo ?? daClasse,
              publica: classePublica || !!Reflect.getMetadata(IS_PUBLIC_KEY, handler),
              classe: exportado as RotaInventariada['classe'],
              handler: handler as RotaInventariada['handler'],
            });
          }
        }
      }
    }
  }
  return rotas.sort((a, b) => a.rota.localeCompare(b.rota));
}
