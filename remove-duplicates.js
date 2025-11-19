const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function removeDuplicates() {
  console.log('🧹 Removendo duplicatas de equipamentos_dados...\n');

  try {
    // Deletar duplicatas mantendo apenas o registro mais antigo (menor ID)
    const result = await prisma.$executeRaw`
      DELETE FROM equipamentos_dados
      WHERE id IN (
        SELECT id
        FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY equipamento_id, timestamp_dados
              ORDER BY created_at ASC, id ASC
            ) as rn
          FROM equipamentos_dados
        ) t
        WHERE t.rn > 1
      )
    `;

    console.log(`✅ ${result} registros duplicados removidos\n`);

    // Verificar se ainda existem duplicatas
    const remaining = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM equipamentos_dados ed1
      WHERE EXISTS (
        SELECT 1
        FROM equipamentos_dados ed2
        WHERE ed1.equipamento_id = ed2.equipamento_id
          AND ed1.timestamp_dados = ed2.timestamp_dados
          AND ed1.id != ed2.id
      )
    `;

    if (remaining[0].count > 0) {
      console.log(`⚠️ Ainda existem ${remaining[0].count} duplicatas`);
    } else {
      console.log('✅ Nenhuma duplicata restante!');
    }

  } catch (error) {
    console.error('❌ Erro ao remover duplicatas:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

removeDuplicates();
