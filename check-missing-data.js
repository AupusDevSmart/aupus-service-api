/**
 * Verificar dados ausentes do CHINT
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verificar() {
  console.log('\n🔍 VERIFICAÇÃO DE DADOS AUSENTES - CHINT\n');
  console.log('='.repeat(80));

  const equipamento = await prisma.equipamentos.findFirst({
    where: { nome: { contains: 'CHINT', mode: 'insensitive' } },
  });

  if (!equipamento) {
    console.log('❌ Equipamento não encontrado!');
    return;
  }

  console.log(`✅ Equipamento: ${equipamento.nome}\n`);

  // Buscar todos os dados do dia 09/03/2026
  console.log('📅 DIA 09/03/2026 - Análise completa:');

  const dadosDia09 = await prisma.equipamentos_dados.findMany({
    where: {
      equipamento_id: equipamento.id,
      timestamp_dados: {
        gte: new Date('2026-03-09T00:00:00Z'),
        lte: new Date('2026-03-09T23:59:59Z'),
      },
    },
    select: {
      timestamp_dados: true,
      dados: true,
    },
    orderBy: {
      timestamp_dados: 'desc',
    },
  });

  console.log(`   Total de registros: ${dadosDia09.length}`);

  if (dadosDia09.length > 0) {
    const primeiro = dadosDia09[dadosDia09.length - 1];
    const ultimo = dadosDia09[0];

    console.log(`\n   Primeiro registro do dia:`);
    console.log(`   - UTC: ${primeiro.timestamp_dados.toISOString()}`);
    console.log(`   - BRT: ${primeiro.timestamp_dados.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    console.log(`   - Energia: ${primeiro.dados?.consumo_phf || 0} kWh`);

    console.log(`\n   Último registro do dia:`);
    console.log(`   - UTC: ${ultimo.timestamp_dados.toISOString()}`);
    console.log(`   - BRT: ${ultimo.timestamp_dados.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    console.log(`   - Energia: ${ultimo.dados?.consumo_phf || 0} kWh`);

    // Calcular energia total do dia 09
    let energiaDia09 = 0;
    dadosDia09.forEach(d => {
      energiaDia09 += parseFloat(d.dados?.consumo_phf?.toString() || '0');
    });

    console.log(`\n   Energia total do dia 09: ${energiaDia09.toFixed(2)} kWh`);

    // Verificar distribuição por hora
    console.log(`\n   📊 Distribuição de registros por hora (BRT):`);
    const porHora = {};
    dadosDia09.forEach(d => {
      const horaBrt = new Date(d.timestamp_dados.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getHours();
      porHora[horaBrt] = (porHora[horaBrt] || 0) + 1;
    });

    for (let h = 0; h < 24; h++) {
      const count = porHora[h] || 0;
      const barra = '█'.repeat(Math.floor(count / 10));
      console.log(`      ${String(h).padStart(2, '0')}h: ${String(count).padStart(4)} registros ${barra}`);
    }
  }

  // Buscar dados após 09/03
  console.log(`\n\n📅 DADOS APÓS 09/03/2026:`);

  const dadosDepois = await prisma.equipamentos_dados.findMany({
    where: {
      equipamento_id: equipamento.id,
      timestamp_dados: {
        gt: new Date('2026-03-09T23:59:59Z'),
        lte: new Date('2026-03-10T23:59:59Z'),
      },
    },
    select: {
      timestamp_dados: true,
      dados: true,
    },
    orderBy: {
      timestamp_dados: 'asc',
    },
    take: 5,
  });

  if (dadosDepois.length > 0) {
    console.log(`   Primeiros registros do dia 10/03:`);
    dadosDepois.forEach((d, i) => {
      const brt = d.timestamp_dados.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      console.log(`   ${i + 1}. ${d.timestamp_dados.toISOString()} (${brt}) - ${d.dados?.consumo_phf || 0} kWh`);
    });
  } else {
    console.log(`   ❌ Nenhum registro encontrado no dia 10/03!`);
  }

  // Verificar campo de energia acumulada
  console.log(`\n\n📊 VERIFICAÇÃO DE ENERGIA ACUMULADA:`);

  const ultimoRegistroGeral = await prisma.equipamentos_dados.findFirst({
    where: {
      equipamento_id: equipamento.id,
    },
    orderBy: {
      timestamp_dados: 'desc',
    },
    select: {
      timestamp_dados: true,
      dados: true,
    },
  });

  if (ultimoRegistroGeral) {
    console.log(`   Último registro no banco:`);
    console.log(`   - Timestamp: ${ultimoRegistroGeral.timestamp_dados.toISOString()}`);
    console.log(`   - BRT: ${ultimoRegistroGeral.timestamp_dados.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    console.log(`   - Dados:`, JSON.stringify(ultimoRegistroGeral.dados, null, 2));
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n💡 CONCLUSÕES:');
  console.log('   1. Verificar se o equipamento ainda está enviando dados');
  console.log('   2. Verificar se há problema na integração MQTT');
  console.log('   3. A diferença de energia pode ser dados não coletados\n');

  await prisma.$disconnect();
}

verificar().catch(console.error);
