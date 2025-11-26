const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function limparDadosFalsos() {
  console.log('🧹 Limpando dados falsos do inversor...');

  try {
    // ID do inversor que populamos com dados falsos
    const equipamentoId = 'cmhddtv0h0024jqo8h4dzm4gq';

    // Limpar TODOS os dados deste equipamento
    const resultado = await prisma.equipamentos_dados.deleteMany({
      where: {
        equipamento_id: equipamentoId
      }
    });

    console.log(`✅ ${resultado.count} registros falsos removidos do banco de dados!`);

  } catch (error) {
    console.error('❌ Erro ao limpar dados:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar limpeza
limparDadosFalsos()
  .then(() => {
    console.log('🎉 Limpeza concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  });