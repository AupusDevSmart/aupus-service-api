const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('🔄 Adicionando programacao_os ao enum tipo_solicitante...');

    await prisma.$executeRawUnsafe(`
      ALTER TYPE tipo_solicitante ADD VALUE IF NOT EXISTS 'programacao_os';
    `);

    console.log('✅ Enum atualizado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao atualizar enum:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
