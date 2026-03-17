const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixHistoricoTable() {
  console.log('🔧 Verificando e corrigindo tabela historico_solicitacao_servico...\n');

  try {
    // Verificar colunas existentes
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'historico_solicitacao_servico'
      AND table_schema = 'public'
      ORDER BY ordinal_position;
    `;

    console.log('📊 Colunas atuais:');
    columns.forEach(c => {
      console.log(`   - ${c.column_name} (${c.data_type})`);
    });

    const columnNames = columns.map(c => c.column_name);

    // Verificar se a coluna usuario existe e renomeá-la para usuario_nome
    if (columnNames.includes('usuario') && !columnNames.includes('usuario_nome')) {
      console.log('\n🔄 Renomeando coluna usuario para usuario_nome...');
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "historico_solicitacao_servico"
        RENAME COLUMN "usuario" TO "usuario_nome"
      `);
      console.log('✅ Coluna renomeada');
    } else if (!columnNames.includes('usuario_nome') && !columnNames.includes('usuario')) {
      // Adicionar coluna usuario_nome se nem usuario nem usuario_nome existirem
      console.log('\n➕ Adicionando coluna usuario_nome...');
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "historico_solicitacao_servico"
        ADD COLUMN "usuario_nome" VARCHAR(255) NOT NULL DEFAULT 'Sistema'
      `);
      console.log('✅ Coluna usuario_nome adicionada');

      // Remover o default depois
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "historico_solicitacao_servico"
        ALTER COLUMN "usuario_nome" DROP DEFAULT
      `);
    } else if (columnNames.includes('usuario_nome')) {
      console.log('\n✓ Coluna usuario_nome já existe');
    }

    // Verificar estrutura final
    console.log('\n📊 Verificação final da tabela:');
    const finalColumns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'historico_solicitacao_servico'
      AND table_schema = 'public'
      ORDER BY ordinal_position;
    `;

    finalColumns.forEach(c => {
      console.log(`   - ${c.column_name} (${c.data_type}) ${c.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    console.log('\n✅ Tabela historico_solicitacao_servico corrigida!');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixHistoricoTable();