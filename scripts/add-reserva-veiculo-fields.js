// Script para adicionar campos de reserva de veículo na tabela programacoes_os
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Adicionando campos de reserva de veículo...');

  try {
    // Adicionar campos
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "programacoes_os"
      ADD COLUMN IF NOT EXISTS "veiculo_id" CHAR(26),
      ADD COLUMN IF NOT EXISTS "reserva_data_inicio" DATE,
      ADD COLUMN IF NOT EXISTS "reserva_data_fim" DATE,
      ADD COLUMN IF NOT EXISTS "reserva_hora_inicio" VARCHAR(5),
      ADD COLUMN IF NOT EXISTS "reserva_hora_fim" VARCHAR(5),
      ADD COLUMN IF NOT EXISTS "reserva_finalidade" TEXT;
    `);

    console.log('✅ Campos adicionados com sucesso!');

    // Criar índice para melhor performance
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "programacoes_os_veiculo_id_idx" ON "programacoes_os"("veiculo_id");
    `);

    console.log('✅ Índice criado com sucesso!');

    // Verificar se os campos foram adicionados
    const result = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'programacoes_os'
      AND column_name IN ('veiculo_id', 'reserva_data_inicio', 'reserva_data_fim', 'reserva_hora_inicio', 'reserva_hora_fim', 'reserva_finalidade')
      ORDER BY column_name;
    `);

    console.log('\n📋 Campos adicionados:');
    console.table(result);

  } catch (error) {
    console.error('❌ Erro ao adicionar campos:', error.message);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
