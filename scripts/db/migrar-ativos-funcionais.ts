/**
 * Migra os equipamentos existentes para posicao + fisico.
 *
 *   pnpm exec ts-node scripts/db/migrar-ativos-funcionais.ts            # simula
 *   pnpm exec ts-node scripts/db/migrar-ativos-funcionais.ts --aplicar  # grava
 *
 * Simula por padrao, e nao o contrario. Migracao que grava sem pedir e a que
 * roda por engano no banco errado.
 */
import { PrismaClient } from '@prisma/client';
import { migrarEquipamentosParaPosicoes } from '../../src/core/modules/ativos-funcionais/migrar-equipamentos';

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const prisma = new PrismaClient();

  const [{ banco }] = await prisma.$queryRawUnsafe<Array<{ banco: string }>>(
    'SELECT current_database() AS banco',
  );

  console.log(aplicar ? '>>> APLICANDO' : '>>> SIMULANDO (use --aplicar para gravar)');
  console.log(`>>> banco: ${banco}\n`);

  const r = await migrarEquipamentosParaPosicoes(prisma as any, { simular: !aplicar });

  console.log(`posicoes ${aplicar ? 'criadas' : 'que seriam criadas'}: ${r.migrados}`);
  console.log('deixados de fora:');
  console.log(`  ja migrados:      ${r.ignorados.ja_migrado}`);
  console.log(`  nao sao UC:       ${r.ignorados.nao_e_uc}`);
  console.log(`  sem instalacao:   ${r.ignorados.sem_instalacao}`);
  console.log(`  sem categoria:    ${r.ignorados.sem_categoria}`);

  const nomeados = r.detalhes.filter(d => !/ja tem posicao|peca/.test(d.motivo));
  if (nomeados.length) {
    console.log('\nquem ficou de fora por falta de dado (precisa de decisao):');
    for (const d of nomeados) console.log(`  ${d.nome} — ${d.motivo}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
