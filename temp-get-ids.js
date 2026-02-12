const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const diagramas = await prisma.diagrama.findMany({
    take: 10,
    select: {
      id: true,
      nome: true,
      descricao: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  console.log('=== DIAGRAMAS DISPONÍVEIS ===');
  console.log(JSON.stringify(diagramas, null, 2));

  if (diagramas.length > 0) {
    console.log('\n=== TESTE A ROTA COM ESTE ID ===');
    console.log(`http://localhost:5173/supervisorio/sinoptico-v2/${diagramas[0].id}`);
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
