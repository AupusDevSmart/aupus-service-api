const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Corrigindo campos "undefined" em IMS_A966 e METER_LANDIS...\n');

  try {
    // IMS_A966 - Remover schema inválido (será definido posteriormente)
    console.log('📝 Processando IMS_A966...');
    await prisma.tipos_equipamentos.update({
      where: { codigo: 'IMS_A966' },
      data: {
        propriedades_schema: null // Remover schema inválido
      }
    });
    console.log('✅ IMS_A966 - Schema inválido removido (será definido posteriormente)\n');

    // METER_LANDIS - Remover schema inválido (será definido posteriormente)
    console.log('📝 Processando METER_LANDIS...');
    await prisma.tipos_equipamentos.update({
      where: { codigo: 'METER_LANDIS' },
      data: {
        propriedades_schema: null // Remover schema inválido
      }
    });
    console.log('✅ METER_LANDIS - Schema inválido removido (será definido posteriormente)\n');

    console.log('🎉 Correção concluída!');
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
