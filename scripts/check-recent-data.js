const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkRecentData() {
  try {
    console.log('🌅 Verificando dados MAIS RECENTES (últimos 50 registros):');
    console.log('');

    // Buscar últimos 50 registros sem filtro de data
    const dados = await prisma.equipamentos_dados.findMany({
      where: {
        equipamento_id: 'cmhcfyoj30003jqo8bhhaexlp'
      },
      orderBy: {
        created_at: 'desc'
      },
      take: 50
    });

    console.log(`📊 Total de registros encontrados: ${dados.length}`);
    console.log('');
    console.log('Últimos 50 registros (qualquer data):');
    console.log('='.repeat(100));

    dados.forEach((d, i) => {
      const power = d.dados?.power ?? 'N/A';
      const timestamp = d.timestamp_dados?.toISOString() || 'N/A';
      const created = d.created_at.toISOString();
      console.log(`${i + 1}. Timestamp: ${timestamp} | Power: ${power} kW | Created: ${created}`);
    });

    // Mostrar o registro mais recente
    if (dados.length > 0) {
      const maisRecente = dados[0];
      console.log('');
      console.log('📅 REGISTRO MAIS RECENTE:');
      console.log('Created at:', maisRecente.created_at.toISOString());
      console.log('Timestamp dados:', maisRecente.timestamp_dados?.toISOString());
      console.log('Power:', maisRecente.dados?.power);
      console.log('Dados completos:', JSON.stringify(maisRecente.dados, null, 2));
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('Erro:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkRecentData();
