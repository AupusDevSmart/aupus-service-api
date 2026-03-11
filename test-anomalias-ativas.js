// Script para testar anomalias ativas no dashboard
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['query', 'error', 'warn'],
});

async function testAnomalias() {
  console.log('\n🔍 TESTANDO ANOMALIAS ATIVAS\n');
  console.log('='.repeat(80));

  try {
    // 1. Contar TODAS as anomalias (incluindo deletadas)
    const totalAnomalias = await prisma.anomalias.count();
    console.log(`\n📊 Total de anomalias no banco: ${totalAnomalias}`);

    // 2. Contar anomalias NÃO deletadas
    const anomaliasAtivas = await prisma.anomalias.count({
      where: {
        deleted_at: null,
      },
    });
    console.log(`📊 Anomalias não deletadas: ${anomaliasAtivas}`);

    // 3. Contar por status (apenas não deletadas)
    console.log('\n📈 ANOMALIAS POR STATUS (não deletadas):\n');

    const statusCounts = await prisma.anomalias.groupBy({
      by: ['status'],
      where: {
        deleted_at: null,
      },
      _count: {
        status: true,
      },
    });

    statusCounts.forEach(item => {
      console.log(`   ${item.status}: ${item._count.status}`);
    });

    // 4. Anomalias que devem aparecer no dashboard (AGUARDANDO, EM_ANALISE, OS_GERADA)
    const statusAtivos = ['AGUARDANDO', 'EM_ANALISE', 'OS_GERADA'];

    const anomaliasParaDashboard = await prisma.anomalias.count({
      where: {
        deleted_at: null,
        status: {
          in: statusAtivos,
        },
      },
    });

    console.log(`\n✅ ANOMALIAS ATIVAS PARA DASHBOARD: ${anomaliasParaDashboard}`);
    console.log(`   (Status: ${statusAtivos.join(', ')})\n`);

    // 5. Listar as 10 primeiras anomalias ativas
    const anomaliasDetalhadas = await prisma.anomalias.findMany({
      where: {
        deleted_at: null,
        status: {
          in: statusAtivos,
        },
      },
      select: {
        id: true,
        descricao: true,
        status: true,
        prioridade: true,
        data: true,
        planta: {
          select: {
            nome: true,
          },
        },
        equipamento: {
          select: {
            nome: true,
          },
        },
      },
      orderBy: {
        data: 'desc',
      },
      take: 10,
    });

    if (anomaliasDetalhadas.length > 0) {
      console.log('📋 ÚLTIMAS 10 ANOMALIAS ATIVAS:\n');
      anomaliasDetalhadas.forEach((anomalia, index) => {
        console.log(`${index + 1}. ${anomalia.descricao.substring(0, 60)}...`);
        console.log(`   Status: ${anomalia.status} | Prioridade: ${anomalia.prioridade}`);
        console.log(`   Planta: ${anomalia.planta?.nome || 'N/A'} | Equipamento: ${anomalia.equipamento?.nome || 'N/A'}`);
        console.log(`   Data: ${anomalia.data.toLocaleString('pt-BR')}`);
        console.log('');
      });
    } else {
      console.log('⚠️  Nenhuma anomalia ativa encontrada no banco de dados.\n');
    }

    // 6. Verificar se o backend está retornando corretamente
    console.log('='.repeat(80));
    console.log('\n💡 ANÁLISE:\n');

    if (anomaliasParaDashboard === 0) {
      console.log('❌ Não há anomalias ativas no banco de dados.');
      console.log('   Possíveis causas:');
      console.log('   1. Todas as anomalias foram resolvidas ou canceladas');
      console.log('   2. Não há anomalias cadastradas para este cliente');
      console.log('   3. As anomalias foram deletadas (soft delete)');
      console.log('\n💡 Solução: Criar novas anomalias de teste ou verificar filtros no backend.');
    } else {
      console.log(`✅ Há ${anomaliasParaDashboard} anomalias ativas no banco.`);
      console.log('   O dashboard COA deve estar usando lógica diferente para gerar alertas.');
      console.log('   Verificar: src/modules/coa/coa.service.ts - método fetchDashboardData()');
    }

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Erro ao consultar anomalias:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar teste
testAnomalias();
