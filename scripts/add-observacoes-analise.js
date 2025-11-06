// Script para adicionar campos de análise na tabela anomalias
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Adicionando campos de análise na tabela anomalias...\n');

  try {
    // Ler o arquivo SQL
    const sqlPath = path.join(__dirname, '..', 'prisma', 'add-observacoes-analise.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Dividir em statements individuais (remover comentários e linhas vazias)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && !s.startsWith('COMMENT'));

    // Executar cada statement
    for (const statement of statements) {
      if (statement) {
        console.log('📝 Executando:', statement.substring(0, 50) + '...');
        await prisma.$executeRawUnsafe(statement);
        console.log('   ✅ Sucesso\n');
      }
    }

    // Executar comentários separadamente
    const comments = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.startsWith('COMMENT'));

    for (const comment of comments) {
      if (comment) {
        console.log('💬 Adicionando comentário...');
        await prisma.$executeRawUnsafe(comment);
        console.log('   ✅ Sucesso\n');
      }
    }

    console.log('✨ Migration concluída com sucesso!');
    console.log('\n📋 Campos adicionados:');
    console.log('   - observacoes_analise: TEXT');
    console.log('   - analisado_por: VARCHAR(255)');
    console.log('   - data_analise: TIMESTAMP(0)');

  } catch (error) {
    console.error('❌ Erro durante a migration:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
