const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTodayData() {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    console.log('🌅 Verificando dados de HOJE:', now.toISOString());
    console.log('Início do dia:', startOfToday.toISOString());
    console.log('');

    // Buscar dados de hoje do Inversor 1
    const dados = await prisma.equipamentos_dados.findMany({
      where: {
        equipamento_id: 'cmhcfyoj30003jqo8bhhaexlp',
        created_at: {
          gte: startOfToday
        }
      },
      orderBy: {
        created_at: 'desc'
      },
      take: 30
    });

    console.log(`📊 Total de registros hoje: ${dados.length}`);
    console.log('');
    console.log('Últimos 30 registros de HOJE:');
    console.log('='.repeat(100));

    dados.forEach((d, i) => {
      const power = d.dados?.power ?? 'N/A';
      const timestamp = d.timestamp_dados?.toISOString() || 'N/A';
      const created = d.created_at.toISOString();
      console.log(`${i + 1}. Timestamp: ${timestamp} | Power: ${power} kW | Created: ${created}`);
    });

    // Contar registros com potência > 0 hoje
    const withPower = dados.filter(d => d.dados?.power > 0);
    console.log('');
    console.log(`⚡ Registros com potência > 0 hoje: ${withPower.length}`);

    if (withPower.length > 0) {
      console.log('');
      console.log('Primeiros 5 com potência > 0:');
      withPower.slice(-5).reverse().forEach((d, i) => {
        console.log(`${i + 1}. ${d.timestamp_dados?.toISOString()} | Power: ${d.dados.power} kW`);
      });
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('Erro:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkTodayData();
