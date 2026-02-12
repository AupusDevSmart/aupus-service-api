import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface RestoreStats {
  tableName: string;
  recordCount: number;
  status: 'success' | 'error' | 'skipped';
  error?: string;
}

async function restoreDatabase(backupPath: string) {
  if (!fs.existsSync(backupPath)) {
    console.error(`❌ Diretório de backup não encontrado: ${backupPath}`);
    process.exit(1);
  }

  console.log('🔄 Iniciando restore do banco de dados...');
  console.log(`📁 Origem: ${backupPath}\n`);

  // Ler metadados
  const metadataPath = path.join(backupPath, '_metadata.json');
  if (fs.existsSync(metadataPath)) {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    console.log(`📊 Informações do backup:`);
    console.log(`   • Data: ${new Date(metadata.timestamp).toLocaleString('pt-BR')}`);
    console.log(`   • Total de registros: ${metadata.totalRecords.toLocaleString()}`);
    console.log(`   • Tabelas: ${metadata.totalTables}`);
    console.log('');
  }

  const stats: RestoreStats[] = [];
  const startTime = Date.now();

  // Listar arquivos JSON no diretório
  const files = fs.readdirSync(backupPath)
    .filter(file => file.endsWith('.json') && file !== '_metadata.json');

  console.log(`📦 Encontrados ${files.length} arquivos para restaurar\n`);

  // Perguntar confirmação
  console.log('⚠️  ATENÇÃO: Este processo irá SUBSTITUIR os dados existentes!');
  console.log('   Recomenda-se fazer backup do banco atual antes de continuar.\n');

  // Ordem de restauração (considerando dependências de foreign keys)
  const orderedTables = [
    // Tabelas sem dependências primeiro
    'cache_locks',
    'migrations',
    'password_reset_tokens',
    'failed_jobs',
    'sessions',
    'personal_access_tokens',
    'telescope_entries',
    'telescope_entries_tags',
    'telescope_monitoring',
    'permissions',
    'roles',
    'role_has_permissions',

    // Organizações e usuários
    'organizacoes',
    'concessionarias',
    'usuarios',
    'organizacao_usuario',
    'concessionaria_usuario',
    'model_has_permissions',
    'model_has_roles',

    // Endereços e telefones
    'enderecos',
    'telefones',

    // Plantas e unidades
    'plantas',
    'unidades',
    'configuracao_plantas',

    // Equipamentos
    'categorias_equipamentos',
    'tipos_equipamentos',
    'equipamentos',
    'equipamentos_dados_tecnicos',
    'equipamentos_dados',
    'equipamentos_conexoes',
    'diagramas_unitarios',
    'inversor_leituras',

    // Concessionárias e configurações
    'concessionarias_energia',
    'anexos_concessionarias_energia',
    'configuracao_demanda',
    'unidades_consumidoras',
    'faturas',
    'historicos_faturamento',
    'documentos',

    // Anomalias
    'anomalias',
    'historico_anomalias',
    'anexos_anomalias',

    // Manutenção
    'planos_manutencao',
    'tarefas',
    'sub_tarefas',
    'recursos_tarefa',
    'anexos_tarefa',

    // Agenda
    'feriados',
    'feriado_plantas',
    'configuracoes_dias_uteis',

    // Veículos
    'veiculo',
    'documentacao_veiculo',
    'reserva_veiculo',

    // Ferramentas
    'ferramentas',
    'historico_calibracoes',
    'historico_manutencoes',

    // Ordens de Serviço
    'programacoes_os',
    'materiais_programacao_os',
    'ferramentas_programacao_os',
    'tecnicos_programacao_os',
    'tarefas_programacao_os',
    'historico_programacao_os',
    'ordens_servico',
    'tarefas_os',
    'materiais_os',
    'ferramentas_os',
    'tecnicos_os',
    'historico_os',
    'checklist_atividades_os',
    'anexos_os',
    'registros_tempo_os',

    // Outras tabelas
    'configuracoes',
    'consorcios',
    'controle_clube',
    'feedbacks',
    'notificacoes',
    'oportunidades',
    'propostas',
    'prospects',
    'rateios',
  ];

  // Desabilitar triggers e constraints temporariamente
  console.log('⚙️  Preparando banco para restore...');
  await prisma.$executeRaw`SET session_replication_role = 'replica';`;

  // Restaurar cada tabela
  for (const tableName of orderedTables) {
    const fileName = `${tableName}.json`;
    const filePath = path.join(backupPath, fileName);

    if (!fs.existsSync(filePath)) {
      stats.push({
        tableName,
        recordCount: 0,
        status: 'skipped',
        error: 'Arquivo não encontrado'
      });
      continue;
    }

    try {
      console.log(`📋 Restaurando tabela: ${tableName}...`);

      // Ler dados do arquivo
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(fileContent);

      if (!Array.isArray(data) || data.length === 0) {
        console.log(`   ⏭️  Tabela vazia, pulando...`);
        stats.push({
          tableName,
          recordCount: 0,
          status: 'skipped',
          error: 'Sem dados'
        });
        continue;
      }

      // Limpar tabela atual
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tableName}" CASCADE;`);

      // Inserir dados em lotes para melhor performance
      const batchSize = 500;
      let totalInserted = 0;

      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, Math.min(i + batchSize, data.length));

        // Construir query INSERT para cada batch
        for (const record of batch) {
          const columns = Object.keys(record);
          const values = Object.values(record);

          const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
          const columnsStr = columns.map(col => `"${col}"`).join(', ');

          await prisma.$executeRawUnsafe(
            `INSERT INTO "${tableName}" (${columnsStr}) VALUES (${placeholders})`,
            ...values
          );

          totalInserted++;
        }

        console.log(`   📦 ${totalInserted}/${data.length} registros inseridos...`);
      }

      stats.push({
        tableName,
        recordCount: totalInserted,
        status: 'success'
      });

      console.log(`   ✅ ${totalInserted} registros restaurados`);

    } catch (error: any) {
      console.error(`   ❌ Erro ao restaurar ${tableName}: ${error.message}`);
      stats.push({
        tableName,
        recordCount: 0,
        status: 'error',
        error: error.message
      });
    }
  }

  // Reabilitar triggers e constraints
  console.log('\n⚙️  Finalizando restore...');
  await prisma.$executeRaw`SET session_replication_role = 'origin';`;

  // Atualizar sequences (para que auto-increment funcione corretamente)
  console.log('🔄 Atualizando sequences...');
  const sequences = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public';
  `;

  for (const { tablename } of sequences) {
    try {
      await prisma.$executeRawUnsafe(`
        SELECT setval(
          pg_get_serial_sequence('${tablename}', 'id'),
          COALESCE((SELECT MAX(id) FROM "${tablename}"), 1),
          true
        ) WHERE pg_get_serial_sequence('${tablename}', 'id') IS NOT NULL;
      `);
    } catch (error) {
      // Ignora tabelas sem sequence
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Resumo
  console.log('\n' + '='.repeat(60));
  console.log('✅ RESTORE CONCLUÍDO!');
  console.log('='.repeat(60));
  console.log(`📊 Resumo:`);
  console.log(`   • Tabelas processadas: ${stats.length}`);
  console.log(`   • Sucesso: ${stats.filter(s => s.status === 'success').length}`);
  console.log(`   • Falhas: ${stats.filter(s => s.status === 'error').length}`);
  console.log(`   • Puladas: ${stats.filter(s => s.status === 'skipped').length}`);
  console.log(`   • Total restaurado: ${stats.reduce((sum, s) => sum + s.recordCount, 0).toLocaleString()} registros`);
  console.log(`   • Duração: ${duration}s`);
  console.log('='.repeat(60) + '\n');

  // Listar falhas se houver
  const failures = stats.filter(s => s.status === 'error');
  if (failures.length > 0) {
    console.log('⚠️  Tabelas com erro:');
    failures.forEach(stat => {
      console.log(`   • ${stat.tableName}: ${stat.error}`);
    });
  }

  await prisma.$disconnect();
}

// Obter caminho do backup via argumento
const backupPath = process.argv[2];

if (!backupPath) {
  console.error('❌ Uso: npm run restore -- <caminho_do_backup>');
  console.error('   Exemplo: npm run restore -- backups/backup_2026-02-03T16-30-00');
  process.exit(1);
}

// Executar restore
restoreDatabase(backupPath)
  .catch((error) => {
    console.error('❌ Erro fatal durante restore:', error);
    process.exit(1);
  });
