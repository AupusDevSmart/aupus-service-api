const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Adicionando colunas...\n');

  try {
    // Coluna 1
    console.log('1️⃣ Adicionando observacoes_analise...');
    await prisma.$executeRaw`
      ALTER TABLE anomalias
      ADD COLUMN IF NOT EXISTS observacoes_analise TEXT
    `;
    console.log('   ✅ Sucesso\n');

    // Coluna 2
    console.log('2️⃣ Adicionando analisado_por...');
    await prisma.$executeRaw`
      ALTER TABLE anomalias
      ADD COLUMN IF NOT EXISTS analisado_por VARCHAR(255)
    `;
    console.log('   ✅ Sucesso\n');

    // Coluna 3
    console.log('3️⃣ Adicionando data_analise...');
    await prisma.$executeRaw`
      ALTER TABLE anomalias
      ADD COLUMN IF NOT EXISTS data_analise TIMESTAMP(0)
    `;
    console.log('   ✅ Sucesso\n');

    console.log('✨ Todas as colunas foram adicionadas com sucesso!');

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
