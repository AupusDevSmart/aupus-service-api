// Script para corrigir concessionaria_id vazios no banco de dados
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixEmptyConcessionariaIds() {
  try {
    console.log('🔍 Buscando unidades com concessionaria_id vazio...');

    // Atualizar todas as unidades com concessionaria_id vazio para NULL
    const result = await prisma.$executeRaw`
      UPDATE unidades
      SET concessionaria_id = NULL
      WHERE concessionaria_id = ''
        AND deleted_at IS NULL
    `;

    console.log(`✅ Corrigidas ${result} unidades com concessionaria_id vazio`);

    // Verificar resultado
    const unidadesComNull = await prisma.unidades.count({
      where: {
        concessionaria_id: null,
        deleted_at: null,
      },
    });

    const unidadesComConcessionaria = await prisma.unidades.count({
      where: {
        concessionaria_id: { not: null },
        deleted_at: null,
      },
    });

    console.log('\n📊 Estatísticas:');
    console.log(`   - Unidades sem concessionária: ${unidadesComNull}`);
    console.log(`   - Unidades com concessionária: ${unidadesComConcessionaria}`);

  } catch (error) {
    console.error('❌ Erro ao corrigir concessionaria_id:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixEmptyConcessionariaIds();
