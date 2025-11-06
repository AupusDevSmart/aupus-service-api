const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Verificando comprimento dos IDs...\n');

  // Plantas
  const plantas = await prisma.$queryRaw`
    SELECT id, nome, LENGTH(id) as len
    FROM plantas
    LIMIT 3
  `;
  console.log('📍 Plantas:');
  console.log(JSON.stringify(plantas, null, 2));
  console.log('');

  // Unidades
  const unidades = await prisma.$queryRaw`
    SELECT id, nome, LENGTH(id) as len
    FROM unidades
    LIMIT 3
  `;
  console.log('🏢 Unidades:');
  console.log(JSON.stringify(unidades, null, 2));
  console.log('');

  // Tarefas
  const tarefas = await prisma.$queryRaw`
    SELECT id, descricao, LENGTH(id) as len
    FROM tarefas
    LIMIT 3
  `;
  console.log('📋 Tarefas:');
  console.log(JSON.stringify(tarefas, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
