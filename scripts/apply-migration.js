const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function applyMigration() {
  console.log('🚀 Iniciando aplicação da migração de Solicitações de Serviço...');

  try {
    // Ler o arquivo SQL
    const sqlPath = path.join(__dirname, '..', 'backups', 'migration_solicitacoes_servico_simple.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Dividir o SQL em comandos individuais
    const commands = sql
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));

    console.log(`📝 ${commands.length} comandos SQL encontrados`);

    // Executar cada comando
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i] + ';';

      // Pular comentários
      if (command.trim().startsWith('--') || command.trim().startsWith('COMMENT ON')) {
        continue;
      }

      try {
        console.log(`⏳ Executando comando ${i + 1}/${commands.length}...`);
        await prisma.$executeRawUnsafe(command);
        console.log(`✅ Comando ${i + 1} executado com sucesso`);
      } catch (error) {
        // Se o erro for porque já existe, continuar
        if (error.message.includes('already exists')) {
          console.log(`⚠️ Comando ${i + 1}: Objeto já existe, pulando...`);
        } else {
          console.error(`❌ Erro no comando ${i + 1}:`, error.message);
          throw error;
        }
      }
    }

    // Verificar se as tabelas foram criadas
    console.log('\n🔍 Verificando tabelas criadas...');

    const tables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE 'solicitacoes_servico%'
      OR table_name LIKE '%solicitacao_servico%'
      ORDER BY table_name;
    `;

    console.log('📊 Tabelas encontradas:');
    tables.forEach(table => {
      console.log(`   ✅ ${table.table_name}`);
    });

    // Verificar enums criados
    const enums = await prisma.$queryRaw`
      SELECT typname
      FROM pg_type
      WHERE typname IN (
        'StatusSolicitacaoServico',
        'TipoSolicitacaoServico',
        'PrioridadeSolicitacao',
        'OrigemSolicitacao'
      );
    `;

    console.log('\n📊 Enums encontrados:');
    enums.forEach(enumType => {
      console.log(`   ✅ ${enumType.typname}`);
    });

    // Verificar se o valor foi adicionado ao enum OrigemOS
    const origemOSValues = await prisma.$queryRaw`
      SELECT enumlabel
      FROM pg_enum
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OrigemOS')
      ORDER BY enumsortorder;
    `;

    console.log('\n📊 Valores do enum OrigemOS:');
    origemOSValues.forEach(value => {
      console.log(`   ${value.enumlabel === 'SOLICITACAO_SERVICO' ? '✅' : '○'} ${value.enumlabel}`);
    });

    console.log('\n🎉 Migração aplicada com sucesso!');
    console.log('✨ As tabelas de Solicitações de Serviço foram criadas sem afetar os dados existentes.');

  } catch (error) {
    console.error('❌ Erro ao aplicar migração:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applyMigration();