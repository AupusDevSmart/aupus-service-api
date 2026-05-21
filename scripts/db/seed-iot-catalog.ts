/**
 * SEED: Catalogo IoT (iot_device_tipos + iot_device_modelos)
 *
 * Importa o conteudo de AupusNexOn/public/iot-device-catalog.v2.js
 * (DEVICE_POINTS + DEVICE_MODELS) pras 2 tabelas.
 *
 * IDEMPOTENTE: usa upsert com unique constraints existentes:
 *   - iot_device_tipos: unique(codigo)
 *   - iot_device_modelos: unique(fabricante, modelo)
 *
 * Se as linhas ja existem (caso do /var/www/iot_nexon/ ter populado em prod),
 * o seed NAO sobrescreve — pula com log.
 *
 * Uso:
 *   cd aupus-service-api && pnpm ts-node scripts/db/seed-iot-catalog.ts
 *
 * Pode passar --force pra sobrescrever (substitui pontos/mapeamento existentes):
 *   pnpm ts-node scripts/db/seed-iot-catalog.ts --force
 */

import { PrismaClient } from '@aupus/api-shared';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

const prisma = new PrismaClient();
const FORCE = process.argv.includes('--force');

// Gera ID de 26 hex chars — padrao "novo" da casa (per memoria
// reference_validar_id_existencia_nao_length: coabita cuid antigo de 25 chars).
// O DB declara DEFAULT gen_random_uuid()::text mas estoura char(26),
// entao aplicacao tem que gerar.
function newId(): string {
  return crypto.randomBytes(13).toString('hex');
}

// Caminho do JS estatico, relativo a raiz do monorepo
const CATALOG_JS_PATH = path.resolve(
  __dirname,
  '../../../AupusNexOn/public/iot-device-catalog.v2.js',
);

interface DevicePointEntry {
  label?: string;
  group_order?: string[];
  publish?: Record<string, unknown>;
  ai: unknown[];
  bi: unknown[];
  bo: unknown[];
}

interface DeviceModelEntry {
  fabricante: string;
  modelo: string;
  tipo: string;
  protocolo: string;
  connection_note?: string;
  [key: string]: unknown; // ai_blocks, ai_map, num_mppts, word_order, etc.
}

/**
 * OVERRIDES: definicoes faltantes no JS estatico que o DB precisa.
 *
 * gateway_medidor: referenciado pelo a966-ssu mas nunca definido em DEVICE_POINTS
 * do iot-device-catalog.v2.js (bug pre-existente). Aqui suprimos com os pontos
 * que o gateway A-966 efetivamente publica em /SSU/state.
 */
const POINT_OVERRIDES: Record<string, DevicePointEntry> = {
  gateway_medidor: {
    label: 'Gateway Medidor (SSU)',
    publish: {
      timestamp_format: 'datetime',
      timestamp_position: 'last',
      meta_fields: ['cdo', 'frame'],
    },
    ai: [
      { id: 'phf', label: 'Energia Ativa Forward', unit: 'kWh', json: 'phf' },
      { id: 'phr', label: 'Energia Ativa Reverse', unit: 'kWh', json: 'phr' },
      { id: 'qhfi', label: 'Energia Reativa Q1 Indutiva', unit: 'kVArh', json: 'qhfi' },
      { id: 'qhfc', label: 'Energia Reativa Q1 Capacitiva', unit: 'kVArh', json: 'qhfc' },
      { id: 'qhri', label: 'Energia Reativa Q2 Indutiva', unit: 'kVArh', json: 'qhri' },
      { id: 'qhrc', label: 'Energia Reativa Q2 Capacitiva', unit: 'kVArh', json: 'qhrc' },
    ],
    bi: [
      { id: 'sts', label: 'Status', group: 'estado', json: 'sts' },
    ],
    bo: [],
  },
};

function loadCatalog(): {
  devicePoints: Record<string, DevicePointEntry>;
  deviceModels: Record<string, DeviceModelEntry>;
} {
  if (!fs.existsSync(CATALOG_JS_PATH)) {
    throw new Error(`Catalogo nao encontrado: ${CATALOG_JS_PATH}`);
  }

  const code = fs.readFileSync(CATALOG_JS_PATH, 'utf-8');

  // Sandbox isolado pra avaliar o JS sem poluir global. O arquivo declara
  // `var DEVICE_POINTS = {...}; var DEVICE_MODELS = {...};` no escopo do script.
  const sandbox: Record<string, unknown> = {};
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'iot-device-catalog.v2.js' });

  const devicePoints = sandbox.DEVICE_POINTS as Record<string, DevicePointEntry>;
  const deviceModels = sandbox.DEVICE_MODELS as Record<string, DeviceModelEntry>;

  if (!devicePoints || !deviceModels) {
    throw new Error('DEVICE_POINTS ou DEVICE_MODELS nao encontrados no catalogo');
  }

  // Aplica overrides: tipos faltantes no JS sao injetados aqui sem sobrescrever
  // os existentes (override so adiciona, nunca substitui).
  for (const [codigo, entry] of Object.entries(POINT_OVERRIDES)) {
    if (!devicePoints[codigo]) {
      devicePoints[codigo] = entry;
      console.log(`  [override] tipo "${codigo}" injetado (faltava no JS)`);
    }
  }

  return { devicePoints, deviceModels };
}

async function seedTipos(devicePoints: Record<string, DevicePointEntry>) {
  console.log(`\n=== iot_device_tipos (${Object.keys(devicePoints).length} entradas) ===`);
  let inserted = 0;
  let skipped = 0;
  let updated = 0;

  for (const [codigo, entry] of Object.entries(devicePoints)) {
    const { label, ...pontos } = entry;
    const nome = label ?? codigo;

    const existing = await prisma.iot_device_tipos.findUnique({ where: { codigo } });

    if (existing && !FORCE) {
      console.log(`  [skip] ${codigo} (ja existe — use --force pra sobrescrever)`);
      skipped++;
      continue;
    }

    if (existing && FORCE) {
      await prisma.iot_device_tipos.update({
        where: { codigo },
        data: { nome, pontos: pontos as object },
      });
      console.log(`  [upd]  ${codigo} (${nome})`);
      updated++;
    } else {
      await prisma.iot_device_tipos.create({
        data: { id: newId(), codigo, nome, pontos: pontos as object },
      });
      console.log(`  [ins]  ${codigo} (${nome})`);
      inserted++;
    }
  }

  console.log(`Tipos: ${inserted} inseridos, ${updated} atualizados, ${skipped} pulados`);
}

async function seedModelos(
  deviceModels: Record<string, DeviceModelEntry>,
) {
  console.log(`\n=== iot_device_modelos (${Object.keys(deviceModels).length} entradas) ===`);
  let inserted = 0;
  let skipped = 0;
  let updated = 0;
  let orphans = 0;

  // Resolver tipo_id por codigo
  const tipos = await prisma.iot_device_tipos.findMany();
  const tipoIdByCodigo = new Map(tipos.map((t) => [t.codigo, t.id]));

  for (const [catalogId, model] of Object.entries(deviceModels)) {
    const tipoId = tipoIdByCodigo.get(model.tipo);
    if (!tipoId) {
      console.warn(`  [WARN] ${catalogId}: tipo "${model.tipo}" nao encontrado, pulando`);
      orphans++;
      continue;
    }

    const { fabricante, modelo, tipo: _tipo, protocolo, connection_note, ...rest } = model;

    // Preserva o catalog_id literal dentro de mapeamento (pra o endpoint
    // poder reconstruir as chaves de DEVICE_MODELS sem precisar derivar slug).
    const mapeamento = { catalog_id: catalogId, ...rest };

    const existing = await prisma.iot_device_modelos.findUnique({
      where: { fabricante_modelo: { fabricante, modelo } },
    });

    if (existing && !FORCE) {
      console.log(`  [skip] ${catalogId} (${fabricante}/${modelo} ja existe)`);
      skipped++;
      continue;
    }

    if (existing && FORCE) {
      await prisma.iot_device_modelos.update({
        where: { fabricante_modelo: { fabricante, modelo } },
        data: {
          tipo_id: tipoId,
          protocolo,
          connection_note: connection_note ?? null,
          mapeamento: mapeamento as object,
        },
      });
      console.log(`  [upd]  ${catalogId} (${fabricante}/${modelo})`);
      updated++;
    } else {
      await prisma.iot_device_modelos.create({
        data: {
          id: newId(),
          tipo_id: tipoId,
          fabricante,
          modelo,
          protocolo,
          connection_note: connection_note ?? null,
          mapeamento: mapeamento as object,
        },
      });
      console.log(`  [ins]  ${catalogId} (${fabricante}/${modelo})`);
      inserted++;
    }
  }

  console.log(`Modelos: ${inserted} inseridos, ${updated} atualizados, ${skipped} pulados, ${orphans} orfaos`);
}

async function main() {
  console.log(`Seed IoT Catalog ${FORCE ? '(MODO --force)' : '(idempotente)'}`);
  console.log(`Fonte: ${CATALOG_JS_PATH}`);

  const { devicePoints, deviceModels } = loadCatalog();

  await seedTipos(devicePoints);
  await seedModelos(deviceModels);

  console.log('\nConcluido.');
}

main()
  .catch((e) => {
    console.error('Erro no seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
