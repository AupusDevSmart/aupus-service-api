const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listarCategorias() {
  try {
    const categorias = await prisma.categorias_equipamentos.findMany({
      orderBy: { nome: 'asc' }
    });

    console.log('\n========================================');
    console.log('CATEGORIAS DE EQUIPAMENTOS CADASTRADAS');
    console.log('========================================\n');

    categorias.forEach((cat, index) => {
      console.log(`${index + 1}. ${cat.nome}`);
      console.log(`   ID: ${cat.id}\n`);
    });

    console.log(`Total: ${categorias.length} categorias\n`);

  } catch (error) {
    console.error('Erro ao listar categorias:', error);
  } finally {
    await prisma.$disconnect();
  }
}

listarCategorias();
