const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function applyMigration() {
  console.log('🚀 Aplicação manual da migração de Solicitações de Serviço\n');

  try {
    // Passo 1: Verificar e criar enums
    console.log('📌 Passo 1: Verificando enums...');

    const existingEnums = await prisma.$queryRaw`
      SELECT typname FROM pg_type WHERE typname IN (
        'StatusSolicitacaoServico',
        'TipoSolicitacaoServico',
        'PrioridadeSolicitacao',
        'OrigemSolicitacao'
      );
    `;

    console.log(`   Enums já existentes: ${existingEnums.map(e => e.typname).join(', ')}`);

    // Passo 2: Verificar se a tabela principal já existe
    console.log('\n📌 Passo 2: Verificando se a tabela solicitacoes_servico existe...');

    const tableExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'solicitacoes_servico'
      );
    `;

    if (tableExists[0].exists) {
      console.log('   ✅ Tabela solicitacoes_servico já existe');
      return;
    }

    console.log('   ❌ Tabela não existe. Criando...');

    // Passo 3: Criar tabela principal
    console.log('\n📌 Passo 3: Criando tabela solicitacoes_servico...');

    await prisma.$executeRawUnsafe(`
      CREATE TABLE "solicitacoes_servico" (
        "id" TEXT NOT NULL,
        "numero" TEXT NOT NULL,
        "titulo" TEXT NOT NULL,
        "descricao" TEXT NOT NULL,
        "tipo" "TipoSolicitacaoServico" NOT NULL,
        "prioridade" "PrioridadeSolicitacao" NOT NULL DEFAULT 'MEDIA',
        "status" "StatusSolicitacaoServico" NOT NULL DEFAULT 'RASCUNHO',
        "origem" "OrigemSolicitacao" NOT NULL DEFAULT 'PORTAL',
        "planta_id" TEXT NOT NULL,
        "area" TEXT,
        "local_especifico" TEXT,
        "equipamento_id" TEXT,
        "solicitante_nome" TEXT NOT NULL,
        "solicitante_email" TEXT,
        "solicitante_telefone" TEXT,
        "solicitante_departamento" TEXT,
        "solicitante_id" TEXT,
        "data_necessidade" TIMESTAMP(3),
        "prazo_esperado" TIMESTAMP(3),
        "data_inicio_previsto" TIMESTAMP(3),
        "data_fim_previsto" TIMESTAMP(3),
        "tempo_estimado" DECIMAL(10,2),
        "custo_estimado" DECIMAL(10,2),
        "analisado_por_id" TEXT,
        "data_analise" TIMESTAMP(3),
        "observacoes_analise" TEXT,
        "aprovado_por_id" TEXT,
        "data_aprovacao" TIMESTAMP(3),
        "observacoes_aprovacao" TEXT,
        "rejeitado_por_id" TEXT,
        "data_rejeicao" TIMESTAMP(3),
        "motivo_rejeicao" TEXT,
        "cancelado_por_id" TEXT,
        "data_cancelamento" TIMESTAMP(3),
        "motivo_cancelamento" TEXT,
        "concluido_por_id" TEXT,
        "data_conclusao" TIMESTAMP(3),
        "observacoes_conclusao" TEXT,
        "programacao_os_id" TEXT,
        "os_id" TEXT,
        "observacoes" TEXT,
        "requisitos_especiais" TEXT,
        "riscos_identificados" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" TIMESTAMP(3),
        CONSTRAINT "solicitacoes_servico_pkey" PRIMARY KEY ("id")
      )
    `);
    console.log('   ✅ Tabela criada com sucesso');

    // Passo 4: Criar tabelas auxiliares
    console.log('\n📌 Passo 4: Criando tabelas auxiliares...');

    // Histórico
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "historico_solicitacao_servico" (
        "id" TEXT NOT NULL,
        "solicitacao_id" TEXT NOT NULL,
        "acao" TEXT NOT NULL,
        "usuario" TEXT,
        "usuario_id" TEXT,
        "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "observacoes" TEXT,
        "status_anterior" "StatusSolicitacaoServico",
        "status_novo" "StatusSolicitacaoServico",
        "dados_extras" JSONB,
        CONSTRAINT "historico_solicitacao_servico_pkey" PRIMARY KEY ("id")
      )
    `);
    console.log('   ✅ Tabela historico_solicitacao_servico criada');

    // Anexos
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "anexos_solicitacao_servico" (
        "id" TEXT NOT NULL,
        "solicitacao_id" TEXT NOT NULL,
        "nome_original" TEXT NOT NULL,
        "nome_arquivo" TEXT NOT NULL,
        "caminho" TEXT NOT NULL,
        "tamanho" INTEGER NOT NULL,
        "mime_type" TEXT NOT NULL,
        "descricao" TEXT,
        "tipo_documento" TEXT,
        "uploaded_por" TEXT,
        "uploaded_por_id" TEXT,
        "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" TIMESTAMP(3),
        CONSTRAINT "anexos_solicitacao_servico_pkey" PRIMARY KEY ("id")
      )
    `);
    console.log('   ✅ Tabela anexos_solicitacao_servico criada');

    // Comentários
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "comentarios_solicitacao_servico" (
        "id" TEXT NOT NULL,
        "solicitacao_id" TEXT NOT NULL,
        "comentario" TEXT NOT NULL,
        "autor" TEXT NOT NULL,
        "autor_id" TEXT,
        "tipo" TEXT DEFAULT 'COMENTARIO',
        "privado" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" TIMESTAMP(3),
        CONSTRAINT "comentarios_solicitacao_servico_pkey" PRIMARY KEY ("id")
      )
    `);
    console.log('   ✅ Tabela comentarios_solicitacao_servico criada');

    // Passo 5: Criar índices
    console.log('\n📌 Passo 5: Criando índices...');

    const indices = [
      'CREATE UNIQUE INDEX IF NOT EXISTS "solicitacoes_servico_numero_key" ON "solicitacoes_servico"("numero")',
      'CREATE INDEX IF NOT EXISTS "solicitacoes_servico_status_idx" ON "solicitacoes_servico"("status")',
      'CREATE INDEX IF NOT EXISTS "solicitacoes_servico_tipo_idx" ON "solicitacoes_servico"("tipo")',
      'CREATE INDEX IF NOT EXISTS "solicitacoes_servico_planta_id_idx" ON "solicitacoes_servico"("planta_id")',
      'CREATE INDEX IF NOT EXISTS "historico_solicitacao_servico_solicitacao_id_idx" ON "historico_solicitacao_servico"("solicitacao_id")',
      'CREATE INDEX IF NOT EXISTS "anexos_solicitacao_servico_solicitacao_id_idx" ON "anexos_solicitacao_servico"("solicitacao_id")',
      'CREATE INDEX IF NOT EXISTS "comentarios_solicitacao_servico_solicitacao_id_idx" ON "comentarios_solicitacao_servico"("solicitacao_id")'
    ];

    for (const index of indices) {
      await prisma.$executeRawUnsafe(index);
    }
    console.log(`   ✅ ${indices.length} índices criados`);

    // Passo 6: Adicionar foreign keys
    console.log('\n📌 Passo 6: Adicionando foreign keys...');

    const foreignKeys = [
      `ALTER TABLE "solicitacoes_servico" ADD CONSTRAINT "solicitacoes_servico_planta_id_fkey"
       FOREIGN KEY ("planta_id") REFERENCES "plantas"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,

      `ALTER TABLE "solicitacoes_servico" ADD CONSTRAINT "solicitacoes_servico_equipamento_id_fkey"
       FOREIGN KEY ("equipamento_id") REFERENCES "equipamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE`,

      `ALTER TABLE "solicitacoes_servico" ADD CONSTRAINT "solicitacoes_servico_solicitante_id_fkey"
       FOREIGN KEY ("solicitante_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE`,

      `ALTER TABLE "historico_solicitacao_servico" ADD CONSTRAINT "historico_solicitacao_servico_solicitacao_id_fkey"
       FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE`,

      `ALTER TABLE "anexos_solicitacao_servico" ADD CONSTRAINT "anexos_solicitacao_servico_solicitacao_id_fkey"
       FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE`,

      `ALTER TABLE "comentarios_solicitacao_servico" ADD CONSTRAINT "comentarios_solicitacao_servico_solicitacao_id_fkey"
       FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE`
    ];

    for (const fk of foreignKeys) {
      try {
        await prisma.$executeRawUnsafe(fk);
      } catch (error) {
        if (!error.message.includes('already exists')) {
          console.log(`   ⚠️ Erro ao criar FK: ${error.message}`);
        }
      }
    }
    console.log(`   ✅ Foreign keys criadas`);

    // Passo 7: Adicionar valor ao enum OrigemOS
    console.log('\n📌 Passo 7: Adicionando SOLICITACAO_SERVICO ao enum OrigemOS...');

    try {
      await prisma.$executeRawUnsafe(`
        ALTER TYPE "OrigemOS" ADD VALUE IF NOT EXISTS 'SOLICITACAO_SERVICO'
      `);
      console.log('   ✅ Valor adicionado ao enum OrigemOS');
    } catch (error) {
      if (error.message.includes('IF NOT EXISTS')) {
        // PostgreSQL antigo não suporta IF NOT EXISTS, tentar sem ele
        try {
          await prisma.$executeRawUnsafe(`
            ALTER TYPE "OrigemOS" ADD VALUE 'SOLICITACAO_SERVICO'
          `);
          console.log('   ✅ Valor adicionado ao enum OrigemOS');
        } catch (err) {
          if (err.message.includes('already exists')) {
            console.log('   ⚠️ Valor SOLICITACAO_SERVICO já existe no enum OrigemOS');
          } else {
            console.log('   ⚠️ Erro ao adicionar valor ao enum:', err.message);
          }
        }
      }
    }

    // Passo 8: Verificação final
    console.log('\n📌 Passo 8: Verificação final...');

    const finalCheck = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND (
        table_name = 'solicitacoes_servico'
        OR table_name = 'historico_solicitacao_servico'
        OR table_name = 'anexos_solicitacao_servico'
        OR table_name = 'comentarios_solicitacao_servico'
      )
      ORDER BY table_name;
    `;

    console.log('\n✨ Tabelas criadas com sucesso:');
    finalCheck.forEach(table => {
      console.log(`   ✅ ${table.table_name}`);
    });

    console.log('\n🎉 Migração concluída com sucesso!');
    console.log('📝 Seus dados existentes foram preservados.');
    console.log('🚀 O módulo de Solicitações de Serviço está pronto para uso!\n');

  } catch (error) {
    console.error('❌ Erro durante a migração:', error.message);
    console.error('\nDetalhes:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applyMigration();