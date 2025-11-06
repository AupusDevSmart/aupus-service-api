const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tipo = await prisma.tipos_equipamentos.findFirst({
    where: {
      nome: {
        contains: 'nversor',
      },
    },
  });

  if (tipo) {
    console.log('Tipo encontrado:', tipo.nome);
    console.log('Schema:', JSON.stringify(tipo.propriedades_schema, null, 2));
  } else {
    console.log('Tipo não encontrado');
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
