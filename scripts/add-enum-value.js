const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function addEnumValue() {
  console.log('🔧 Adding EM_EXECUCAO to StatusSolicitacaoServico enum in database...\n');

  try {
    // Check if EM_EXECUCAO already exists
    const existingValues = await prisma.$queryRaw`
      SELECT enumlabel
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'StatusSolicitacaoServico'
      AND e.enumlabel = 'EM_EXECUCAO';
    `;

    if (existingValues.length > 0) {
      console.log('✓ EM_EXECUCAO already exists in the enum');
    } else {
      // Add the new value after OS_GERADA
      await prisma.$executeRawUnsafe(`
        ALTER TYPE "StatusSolicitacaoServico"
        ADD VALUE IF NOT EXISTS 'EM_EXECUCAO'
        AFTER 'OS_GERADA';
      `);

      console.log('✅ EM_EXECUCAO added to StatusSolicitacaoServico enum');
    }

    // Verify the enum values
    const allValues = await prisma.$queryRaw`
      SELECT enumlabel
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'StatusSolicitacaoServico'
      ORDER BY e.enumsortorder;
    `;

    console.log('\n📊 Current StatusSolicitacaoServico values:');
    allValues.forEach(v => {
      console.log(`   - ${v.enumlabel}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addEnumValue();