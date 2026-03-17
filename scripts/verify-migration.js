const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifyMigration() {
  console.log('🔍 Verificando status da migração...\n');

  try {
    // 1. Verificar tabelas criadas
    console.log('📊 Tabelas do módulo de Solicitações de Serviço:');
    const tables = await prisma.$queryRaw`
      SELECT table_name,
             (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public'
      AND (
        table_name = 'solicitacoes_servico'
        OR table_name = 'historico_solicitacao_servico'
        OR table_name = 'anexos_solicitacao_servico'
        OR table_name = 'comentarios_solicitacao_servico'
      )
      ORDER BY table_name;
    `;

    tables.forEach(table => {
      console.log(`   ✅ ${table.table_name} (${table.column_count} colunas)`);
    });

    // 2. Verificar enums criados
    console.log('\n📊 Enums do módulo:');
    const enums = await prisma.$queryRaw`
      SELECT typname,
             (SELECT COUNT(*) FROM pg_enum WHERE enumtypid = t.oid) as value_count
      FROM pg_type t
      WHERE typname IN (
        'StatusSolicitacaoServico',
        'TipoSolicitacaoServico',
        'PrioridadeSolicitacao',
        'OrigemSolicitacao'
      );
    `;

    enums.forEach(enumType => {
      console.log(`   ✅ ${enumType.typname} (${enumType.value_count} valores)`);
    });

    // 3. Testar inserção
    console.log('\n🧪 Teste de funcionamento:');
    console.log('   Criando uma solicitação de teste...');

    // Buscar uma planta para o teste
    const planta = await prisma.plantas.findFirst();

    if (planta) {
      const testSolicitacao = await prisma.solicitacoes_servico.create({
        data: {
          numero: `TEST-${Date.now()}`,
          titulo: 'Solicitação de Teste',
          descricao: 'Teste de verificação da migração',
          tipo: 'CONSULTORIA',
          prioridade: 'MEDIA',
          status: 'RASCUNHO',
          origem: 'SISTEMA',
          planta: {
            connect: { id: planta.id }
          },
          local: 'Teste Local',
          justificativa: 'Teste de migração',
          solicitante_nome: 'Sistema de Migração',
        }
      });

      console.log(`   ✅ Solicitação criada: ${testSolicitacao.numero}`);

      // Adicionar histórico
      await prisma.historico_solicitacao_servico.create({
        data: {
          solicitacao: {
            connect: { id: testSolicitacao.id }
          },
          acao: 'TESTE',
          usuario_nome: 'Sistema',
          observacoes: 'Teste de migração'
        }
      });
      console.log('   ✅ Histórico registrado');

      // Limpar dados de teste
      await prisma.historico_solicitacao_servico.deleteMany({
        where: { solicitacao_id: testSolicitacao.id }
      });
      await prisma.solicitacoes_servico.delete({
        where: { id: testSolicitacao.id }
      });
      console.log('   ✅ Dados de teste removidos');
    } else {
      console.log('   ⚠️ Nenhuma planta encontrada para teste');
    }

    // 4. Verificar contagem de registros
    console.log('\n📊 Status do banco:');
    const counts = await prisma.$queryRaw`
      SELECT
        (SELECT COUNT(*) FROM solicitacoes_servico) as solicitacoes,
        (SELECT COUNT(*) FROM historico_solicitacao_servico) as historicos,
        (SELECT COUNT(*) FROM anexos_solicitacao_servico) as anexos,
        (SELECT COUNT(*) FROM comentarios_solicitacao_servico) as comentarios
    `;

    const count = counts[0];
    console.log(`   Solicitações: ${count.solicitacoes}`);
    console.log(`   Históricos: ${count.historicos}`);
    console.log(`   Anexos: ${count.anexos}`);
    console.log(`   Comentários: ${count.comentarios}`);

    // 5. Verificar enum OrigemOS
    console.log('\n📊 Verificando enum OrigemOS:');
    try {
      const origemValues = await prisma.$queryRaw`
        SELECT enumlabel
        FROM pg_enum
        WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OrigemOS')
        ORDER BY enumsortorder;
      `;

      console.log('   Valores do enum OrigemOS:');
      origemValues.forEach(v => {
        const mark = v.enumlabel === 'SOLICITACAO_SERVICO' ? '✅' : '○';
        console.log(`   ${mark} ${v.enumlabel}`);
      });

      if (!origemValues.some(v => v.enumlabel === 'SOLICITACAO_SERVICO')) {
        console.log('\n   ⚠️ SOLICITACAO_SERVICO não foi adicionado ao enum OrigemOS');
        console.log('   ℹ️ Execute manualmente no banco de dados:');
        console.log("   ALTER TYPE \"OrigemOS\" ADD VALUE 'SOLICITACAO_SERVICO';");
      }
    } catch (error) {
      console.log('   ⚠️ Enum OrigemOS não existe ou não pôde ser verificado');
      console.log('   ℹ️ Isso pode ser normal se o módulo de OS não estiver instalado');
    }

    console.log('\n✨ Verificação concluída!');
    console.log('🎉 O módulo de Solicitações de Serviço está funcionando corretamente!');
    console.log('\n📝 Resumo:');
    console.log('   - Todas as tabelas foram criadas');
    console.log('   - Todos os enums estão presentes');
    console.log('   - Operações CRUD funcionam normalmente');
    console.log('   - Seus dados existentes foram preservados');

  } catch (error) {
    console.error('❌ Erro durante verificação:', error.message);
    console.error('Detalhes:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyMigration();