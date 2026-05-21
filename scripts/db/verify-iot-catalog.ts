/**
 * VERIFY: Paridade entre DB e iot-device-catalog.v2.js
 *
 * Mock do que sera o endpoint final `GET /iot-catalog/device-catalog.js`.
 * Le tipos/modelos do DB e reconstroi DEVICE_POINTS/DEVICE_MODELS.
 * Compara com o arquivo estatico atual (diff semantico — JSON deep equal,
 * nao byte-to-byte porque ordem de chaves/whitespace podem variar).
 *
 * Uso:
 *   cd aupus-service-api && pnpm ts-node scripts/db/verify-iot-catalog.ts
 */

import { PrismaClient } from '@aupus/api-shared';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

const prisma = new PrismaClient();

const CATALOG_JS_PATH = path.resolve(
  __dirname,
  '../../../AupusNexOn/public/iot-device-catalog.v2.js',
);

function loadOriginal(): {
  devicePoints: Record<string, any>;
  deviceModels: Record<string, any>;
} {
  const code = fs.readFileSync(CATALOG_JS_PATH, 'utf-8');
  const sandbox: Record<string, unknown> = {};
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'iot-device-catalog.v2.js' });
  return {
    devicePoints: sandbox.DEVICE_POINTS as Record<string, any>,
    deviceModels: sandbox.DEVICE_MODELS as Record<string, any>,
  };
}

async function buildFromDb(): Promise<{
  devicePoints: Record<string, any>;
  deviceModels: Record<string, any>;
}> {
  const tipos = await prisma.iot_device_tipos.findMany();
  const modelos = await prisma.iot_device_modelos.findMany();

  // DEVICE_POINTS: { codigo: { label, ai, bi, bo, group_order?, publish? } }
  // No seed, gravamos `label` (do JS) como `nome` no DB, e o resto dentro de `pontos`.
  // Aqui reconstruimos invertendo: prefixa `label` a partir de `nome`.
  const devicePoints: Record<string, any> = {};
  for (const t of tipos) {
    const pontos = t.pontos as Record<string, any>;
    devicePoints[t.codigo] = { label: t.nome, ...pontos };
  }

  // DEVICE_MODELS: { catalog_id: { fabricante, modelo, tipo, protocolo, connection_note?, ...mapeamento_sem_catalog_id } }
  const tipoCodigoById = new Map(tipos.map((t) => [t.id, t.codigo]));
  const deviceModels: Record<string, any> = {};
  for (const m of modelos) {
    const map = m.mapeamento as Record<string, any>;
    const catalogId = (map.catalog_id as string) ?? `${m.fabricante.toLowerCase()}-${m.modelo.toLowerCase()}`;
    const { catalog_id: _, ...rest } = map;
    deviceModels[catalogId] = {
      fabricante: m.fabricante,
      modelo: m.modelo,
      tipo: tipoCodigoById.get(m.tipo_id) ?? '<unknown>',
      protocolo: m.protocolo,
      ...(m.connection_note ? { connection_note: m.connection_note } : {}),
      ...rest,
    };
  }

  return { devicePoints, deviceModels };
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object') return a === b;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
}

function diffKeys(a: Record<string, any>, b: Record<string, any>, prefix = ''): string[] {
  const out: string[] = [];
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of allKeys) {
    const pk = prefix ? `${prefix}.${k}` : k;
    if (!(k in a)) out.push(`+ ${pk} (so no DB)`);
    else if (!(k in b)) out.push(`- ${pk} (so no JS original)`);
    else if (!deepEqual(a[k], b[k])) {
      // Se ambos sao objetos, recurse
      if (typeof a[k] === 'object' && typeof b[k] === 'object' && !Array.isArray(a[k])) {
        out.push(...diffKeys(a[k], b[k], pk));
      } else {
        out.push(`~ ${pk} (diferente)`);
      }
    }
  }
  return out;
}

async function main() {
  console.log('Carregando arquivo original...');
  const original = loadOriginal();
  console.log(
    `  DEVICE_POINTS: ${Object.keys(original.devicePoints).length} tipos`,
  );
  console.log(
    `  DEVICE_MODELS: ${Object.keys(original.deviceModels).length} modelos`,
  );

  console.log('\nReconstruindo do DB...');
  const rebuilt = await buildFromDb();
  console.log(
    `  DEVICE_POINTS: ${Object.keys(rebuilt.devicePoints).length} tipos`,
  );
  console.log(
    `  DEVICE_MODELS: ${Object.keys(rebuilt.deviceModels).length} modelos`,
  );

  console.log('\n=== DIFF DEVICE_POINTS ===');
  const diffPoints = diffKeys(rebuilt.devicePoints, original.devicePoints);
  if (diffPoints.length === 0) {
    console.log('  paridade OK');
  } else {
    diffPoints.slice(0, 50).forEach((d) => console.log(`  ${d}`));
    if (diffPoints.length > 50) console.log(`  ... +${diffPoints.length - 50} diffs`);
  }

  console.log('\n=== DIFF DEVICE_MODELS ===');
  const diffModels = diffKeys(rebuilt.deviceModels, original.deviceModels);
  if (diffModels.length === 0) {
    console.log('  paridade OK');
  } else {
    diffModels.slice(0, 50).forEach((d) => console.log(`  ${d}`));
    if (diffModels.length > 50) console.log(`  ... +${diffModels.length - 50} diffs`);
  }

  const ok = diffPoints.length === 0 && diffModels.length === 0;
  console.log(`\n${ok ? '✓ PARIDADE PERFEITA' : '✗ HA DIFERENCAS'}`);
  process.exit(ok ? 0 : 1);
}

main()
  .catch((e) => {
    console.error('Erro:', e);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
