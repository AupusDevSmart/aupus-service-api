import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Função para serializar BigInt para JSON
(BigInt.prototype as any).toJSON = function() {
  return this.toString();
};

interface BackupStats {
  tableName: string;
  recordCount: number;
  status: 'success' | 'error';
  error?: string;
}

async function backupDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupDir = path.join(__dirname, '../../backups', `backup_${timestamp}`);

  // Criar diretório de backup
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log('🔄 Iniciando backup completo do banco de dados...');
  console.log(`📁 Diretório de backup: ${backupDir}\n`);

  const stats: BackupStats[] = [];
  const startTime = Date.now();

  // Lista de todas as tabelas do schema
  const tables = [
    'cache_locks',
    'concessionaria_usuario',
    'concessionarias',
    'configuracoes',
    'consorcios',
    'controle_clube',
    'documentos',
    'enderecos',
    'failed_jobs',
    'faturas',
    'feedbacks',
    'historicos_faturamento',
    'migrations',
    'model_has_permissions',
    'model_has_roles',
    'notificacoes',
    'oportunidades',
    'organizacao_usuario',
    'organizacoes',
    'password_reset_tokens',
    'permissions',
    'personal_access_tokens',
    'propostas',
    'prospects',
    'rateios',
    'role_has_permissions',
    'roles',
    'sessions',
    'telefones',
    'telescope_entries',
    'telescope_entries_tags',
    'telescope_monitoring',
    'unidades_consumidoras',
    'usuarios',
    'plantas',
    'unidades',
    'diagramas_unitarios',
    'inversor_leituras',
    'categorias_equipamentos',
    'tipos_equipamentos',
    'equipamentos',
    'equipamentos_dados_tecnicos',
    'equipamentos_dados',
    'equipamentos_conexoes',
    'anomalias',
    'historico_anomalias',
    'anexos_anomalias',
    'planos_manutencao',
    'tarefas',
    'sub_tarefas',
    'recursos_tarefa',
    'anexos_tarefa',
    'feriados',
    'feriado_plantas',
    'configuracoes_dias_uteis',
    'configuracao_plantas',
    'veiculo',
    'documentacao_veiculo',
    'reserva_veiculo',
    'programacoes_os',
    'materiais_programacao_os',
    'ferramentas_programacao_os',
    'tecnicos_programacao_os',
    'historico_programacao_os',
    'ordens_servico',
    'tarefas_programacao_os',
    'tarefas_os',
    'materiais_os',
    'ferramentas_os',
    'tecnicos_os',
    'historico_os',
    'checklist_atividades_os',
    'anexos_os',
    'registros_tempo_os',
    'ferramentas',
    'historico_calibracoes',
    'historico_manutencoes',
    'concessionarias_energia',
    'anexos_concessionarias_energia',
    'configuracao_demanda',
  ];

  // Fazer backup de cada tabela
  for (const tableName of tables) {
    try {
      console.log(`📋 Exportando tabela: ${tableName}...`);

      // Usar query raw para buscar todos os dados
      const data = await prisma.$queryRawUnsafe(`SELECT * FROM "${tableName}"`);

      const recordCount = Array.isArray(data) ? data.length : 0;

      // Salvar em arquivo JSON
      const filePath = path.join(backupDir, `${tableName}.json`);
      fs.writeFileSync(
        filePath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );

      stats.push({
        tableName,
        recordCount,
        status: 'success'
      });

      console.log(`   ✅ ${recordCount} registros exportados`);

    } catch (error: any) {
      console.error(`   ❌ Erro ao exportar ${tableName}: ${error.message}`);
      stats.push({
        tableName,
        recordCount: 0,
        status: 'error',
        error: error.message
      });
    }
  }

  // Salvar metadados do backup
  const metadata = {
    timestamp: new Date().toISOString(),
    database: 'aupus',
    totalTables: tables.length,
    successfulTables: stats.filter(s => s.status === 'success').length,
    failedTables: stats.filter(s => s.status === 'error').length,
    totalRecords: stats.reduce((sum, s) => sum + s.recordCount, 0),
    duration: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
    stats
  };

  fs.writeFileSync(
    path.join(backupDir, '_metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf-8'
  );

  // Resumo
  console.log('\n' + '='.repeat(60));
  console.log('✅ BACKUP CONCLUÍDO!');
  console.log('='.repeat(60));
  console.log(`📊 Resumo:`);
  console.log(`   • Tabelas processadas: ${tables.length}`);
  console.log(`   • Sucesso: ${metadata.successfulTables}`);
  console.log(`   • Falhas: ${metadata.failedTables}`);
  console.log(`   • Total de registros: ${metadata.totalRecords.toLocaleString()}`);
  console.log(`   • Duração: ${metadata.duration}`);
  console.log(`   • Localização: ${backupDir}`);
  console.log('='.repeat(60) + '\n');

  // Listar tabelas com mais registros
  const topTables = [...stats]
    .filter(s => s.status === 'success')
    .sort((a, b) => b.recordCount - a.recordCount)
    .slice(0, 10);

  console.log('📈 Top 10 tabelas com mais registros:');
  topTables.forEach((stat, index) => {
    console.log(`   ${index + 1}. ${stat.tableName}: ${stat.recordCount.toLocaleString()} registros`);
  });

  // Listar falhas se houver
  const failures = stats.filter(s => s.status === 'error');
  if (failures.length > 0) {
    console.log('\n⚠️  Tabelas com erro:');
    failures.forEach(stat => {
      console.log(`   • ${stat.tableName}: ${stat.error}`);
    });
  }

  await prisma.$disconnect();
}

// Executar backup
backupDatabase()
  .catch((error) => {
    console.error('❌ Erro fatal durante backup:', error);
    process.exit(1);
  });
