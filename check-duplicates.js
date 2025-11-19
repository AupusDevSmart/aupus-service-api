const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDuplicates() {
  console.log('🔍 Verificando duplicatas em equipamentos_dados...\n');

  const duplicates = await prisma.$queryRaw`
    SELECT
      equipamento_id,
      timestamp_dados,
      COUNT(*) as count
    FROM equipamentos_dados
    GROUP BY equipamento_id, timestamp_dados
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 10
  `;

  console.log(`📊 Total de grupos duplicados: ${duplicates.length}\n`);

  if (duplicates.length > 0) {
    console.log('Primeiras 10 duplicatas:');
    console.table(duplicates);

    const totalDuplicateRecords = await prisma.$queryRaw`
      SELECT COUNT(*) as total
      FROM equipamentos_dados ed1
      WHERE EXISTS (
        SELECT 1
        FROM equipamentos_dados ed2
        WHERE ed1.equipamento_id = ed2.equipamento_id
          AND ed1.timestamp_dados = ed2.timestamp_dados
          AND ed1.id != ed2.id
      )
    `;

    console.log(`\n📈 Total de registros duplicados: ${totalDuplicateRecords[0].total}`);
  } else {
    console.log('✅ Nenhuma duplicata encontrada!');
  }

  await prisma.$disconnect();
}

checkDuplicates().catch(console.error);
