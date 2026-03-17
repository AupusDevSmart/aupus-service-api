const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function cleanupTestData() {
  console.log('🧹 Limpando dados de teste...\n');

  try {
    // Limpar solicitações de teste
    const deleted = await prisma.solicitacoes_servico.deleteMany({
      where: {
        numero: {
          startsWith: 'TEST-'
        }
      }
    });

    console.log(`✅ ${deleted.count} solicitações de teste removidas`);

    // Verificar contagem final
    const count = await prisma.solicitacoes_servico.count();
    console.log(`📊 Total de solicitações no banco: ${count}`);

    console.log('\n✨ Limpeza concluída!');

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupTestData();