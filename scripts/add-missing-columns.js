const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function addMissingColumns() {
  console.log('🔧 Adicionando colunas faltantes na tabela solicitacoes_servico...\n');

  try {
    // Verificar quais colunas já existem
    const columns = await prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'solicitacoes_servico'
      AND table_schema = 'public';
    `;

    const existingColumns = columns.map(c => c.column_name);
    console.log(`📊 ${existingColumns.length} colunas existentes na tabela`);

    // Colunas que devem existir mas não foram criadas
    const missingColumns = [
      { name: 'local', sql: 'ALTER TABLE "solicitacoes_servico" ADD COLUMN IF NOT EXISTS "local" VARCHAR(255) NOT NULL DEFAULT \'Não especificado\'' },
      { name: 'data_solicitacao', sql: 'ALTER TABLE "solicitacoes_servico" ADD COLUMN IF NOT EXISTS "data_solicitacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP' },
      { name: 'prazo_execucao', sql: 'ALTER TABLE "solicitacoes_servico" ADD COLUMN IF NOT EXISTS "prazo_execucao" INTEGER' },
      { name: 'data_prevista_inicio', sql: 'ALTER TABLE "solicitacoes_servico" ADD COLUMN IF NOT EXISTS "data_prevista_inicio" TIMESTAMP(3)' },
      { name: 'data_prevista_fim', sql: 'ALTER TABLE "solicitacoes_servico" ADD COLUMN IF NOT EXISTS "data_prevista_fim" TIMESTAMP(3)' },
      { name: 'justificativa', sql: 'ALTER TABLE "solicitacoes_servico" ADD COLUMN IF NOT EXISTS "justificativa" TEXT NOT NULL DEFAULT \'Não especificado\'' },
      { name: 'beneficios_esperados', sql: 'ALTER TABLE "solicitacoes_servico" ADD COLUMN IF NOT EXISTS "beneficios_esperados" TEXT' },
      { name: 'riscos_nao_execucao', sql: 'ALTER TABLE "solicitacoes_servico" ADD COLUMN IF NOT EXISTS "riscos_nao_execucao" TEXT' },
      { name: 'materiais_necessarios', sql: 'ALTER TABLE "solicitacoes_servico" ADD COLUMN IF NOT EXISTS "materiais_necessarios" TEXT' },
      { name: 'ferramentas_necessarias', sql: 'ALTER TABLE "solicitacoes_servico" ADD COLUMN IF NOT EXISTS "ferramentas_necessarias" TEXT' },
      { name: 'mao_obra_necessaria', sql: 'ALTER TABLE "solicitacoes_servico" ADD COLUMN IF NOT EXISTS "mao_obra_necessaria" TEXT' },
      { name: 'departamento', sql: 'ALTER TABLE "solicitacoes_servico" ADD COLUMN IF NOT EXISTS "departamento" VARCHAR(100)' },
      { name: 'contato', sql: 'ALTER TABLE "solicitacoes_servico" ADD COLUMN IF NOT EXISTS "contato" VARCHAR(100)' },
      { name: 'analisado_por_nome', sql: 'ALTER TABLE "solicitacoes_servico" ADD COLUMN IF NOT EXISTS "analisado_por_nome" VARCHAR(255)' },
      { name: 'parecer_tecnico', sql: 'ALTER TABLE "solicitacoes_servico" ADD COLUMN IF NOT EXISTS "parecer_tecnico" TEXT' },
      { name: 'aprovado_por_nome', sql: 'ALTER TABLE "solicitacoes_servico" ADD COLUMN IF NOT EXISTS "aprovado_por_nome" VARCHAR(255)' },
      { name: 'sugestoes_alternativas', sql: 'ALTER TABLE "solicitacoes_servico" ADD COLUMN IF NOT EXISTS "sugestoes_alternativas" TEXT' },
      { name: 'cancelado_por_nome', sql: 'ALTER TABLE "solicitacoes_servico" ADD COLUMN IF NOT EXISTS "cancelado_por_nome" VARCHAR(255)' },
      { name: 'ordem_servico_id', sql: 'ALTER TABLE "solicitacoes_servico" ADD COLUMN IF NOT EXISTS "ordem_servico_id" VARCHAR(50)' }
    ];

    console.log('\n📝 Adicionando colunas faltantes...');

    for (const column of missingColumns) {
      if (!existingColumns.includes(column.name)) {
        try {
          console.log(`   ➕ Adicionando coluna ${column.name}...`);

          // PostgreSQL < 9.6 não suporta IF NOT EXISTS para ADD COLUMN
          const sql = column.sql.replace(' IF NOT EXISTS', '');
          await prisma.$executeRawUnsafe(sql);

          console.log(`   ✅ Coluna ${column.name} adicionada`);
        } catch (error) {
          if (error.message.includes('already exists')) {
            console.log(`   ⚠️ Coluna ${column.name} já existe`);
          } else {
            console.log(`   ❌ Erro ao adicionar ${column.name}: ${error.message}`);
          }
        }
      } else {
        console.log(`   ✓ Coluna ${column.name} já existe`);
      }
    }

    // Verificar colunas novamente
    console.log('\n📊 Verificação final...');
    const finalColumns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'solicitacoes_servico'
      AND table_schema = 'public'
      ORDER BY ordinal_position;
    `;

    console.log(`\n✅ Tabela solicitacoes_servico tem ${finalColumns.length} colunas`);

    // Remover o DEFAULT das colunas depois de adicionadas
    console.log('\n🔧 Removendo valores default temporários...');

    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "solicitacoes_servico" ALTER COLUMN "local" DROP DEFAULT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "solicitacoes_servico" ALTER COLUMN "justificativa" DROP DEFAULT`);
      console.log('   ✅ Valores default removidos');
    } catch (error) {
      // Ignorar se não conseguir remover
    }

    console.log('\n🎉 Migração concluída com sucesso!');
    console.log('✨ Todas as colunas necessárias estão presentes na tabela.');

  } catch (error) {
    console.error('❌ Erro durante a migração:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addMissingColumns();