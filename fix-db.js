const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Criando tabela unidades...');

    // 1. Criar tabela unidades
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS unidades AS TABLE unidades_nexon
    `);

    // 2. Adicionar PK
    await prisma.$executeRawUnsafe(`
      ALTER TABLE unidades ADD PRIMARY KEY (id)
    `);

    // 3. Adicionar planta_id
    await prisma.$executeRawUnsafe(`
      ALTER TABLE unidades ADD COLUMN IF NOT EXISTS planta_id CHAR(26)
    `);

    // 4. Setar planta_id
    await prisma.$executeRawUnsafe(`
      UPDATE unidades SET planta_id = (SELECT id FROM plantas ORDER BY created_at LIMIT 1)
    `);

    // 5. NOT NULL
    await prisma.$executeRawUnsafe(`
      ALTER TABLE unidades ALTER COLUMN planta_id SET NOT NULL
    `);

    // 6. Alterar tipos
    await prisma.$executeRawUnsafe(`
      ALTER TABLE unidades ALTER COLUMN tipo TYPE VARCHAR(50)
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE unidades ALTER COLUMN status TYPE VARCHAR(20)
    `);

    const count = await prisma.$queryRaw`SELECT COUNT(*) as count FROM unidades`;
    console.log('✓ Setup concluído!');
    console.log('Total de unidades:', count[0].count);

  } catch (error) {
    console.error('Erro:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
