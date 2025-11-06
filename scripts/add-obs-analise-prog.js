const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Adicionando observacoes_analise em programacoes_os...');
  await prisma.$executeRaw`ALTER TABLE programacoes_os ADD COLUMN IF NOT EXISTS observacoes_analise TEXT`;
  console.log('✅ Coluna adicionada com sucesso!');
  await prisma.$disconnect();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
