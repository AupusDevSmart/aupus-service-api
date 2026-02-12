const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findDiagram() {
  const unidadeId = 'cmkmn2lp606a7jqv9j2lclre2';

  console.log('🔍 Procurando diagrama para unidade:', unidadeId);

  try {
    const diagrama = await prisma.diagramas_unitarios.findFirst({
      where: {
        unidade_id: unidadeId,
        deleted_at: null
      },
      select: {
        id: true,
        nome: true,
        unidade_id: true
      }
    });

    if (diagrama) {
      console.log('\n✅ Diagrama encontrado!');
      console.log('   ID:', diagrama.id);
      console.log('   Nome:', diagrama.nome);
    } else {
      console.log('\n❌ Nenhum diagrama encontrado para esta unidade!');
      console.log('   Você precisa criar um diagrama primeiro.');
    }
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

findDiagram();
