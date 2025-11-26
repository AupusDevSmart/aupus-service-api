const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkInversor() {
  try {
    // Find inverter with the MQTT topic
    const inversor = await prisma.equipamentos.findFirst({
      where: {
        topico_mqtt: 'STA_BRANCA/GO/SOLAR_POWER/UFV05/INVERSOR/3'
      }
    });

    if (!inversor) {
      console.log('❌ Inversor não encontrado com o tópico MQTT especificado');
      return;
    }

    console.log('✅ Inversor encontrado:');
    console.log('   ID:', inversor.id);
    console.log('   Nome:', inversor.nome);
    console.log('   MQTT Topic:', inversor.topico_mqtt);
    console.log('   Tipo:', inversor.tipo_equipamento_id);

    // Count data records
    const totalRecords = await prisma.equipamentos_dados.count({
      where: {
        equipamento_id: inversor.id
      }
    });

    console.log('\n📊 Total de registros de dados:', totalRecords);

    // Get recent data
    const recentData = await prisma.equipamentos_dados.findMany({
      where: {
        equipamento_id: inversor.id
      },
      orderBy: {
        timestamp_dados: 'desc'
      },
      take: 5
    });

    console.log('\n📅 Últimos 5 registros:');
    recentData.forEach(record => {
      console.log('   -', record.timestamp_dados.toISOString(), '| Qualidade:', record.qualidade);
      // Show a sample of the data
      if (record.dados) {
        try {
          // dados might already be an object, not a string
          const dados = typeof record.dados === 'string' ? JSON.parse(record.dados) : record.dados;
          if (dados.power && dados.power.active_total) {
            console.log('     Potência:', (dados.power.active_total / 1000).toFixed(2), 'kW');
          }
        } catch (e) {
          console.log('     Erro ao parsear dados:', e.message);
        }
      }
    });

    // Check today's data
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayCount = await prisma.equipamentos_dados.count({
      where: {
        equipamento_id: inversor.id,
        timestamp_dados: {
          gte: today,
          lt: tomorrow
        }
      }
    });

    console.log('\n📊 Dados de hoje (' + today.toLocaleDateString() + '):', todayCount, 'registros');

    // Check this month's data
    const startOfMonth = new Date(today);
    startOfMonth.setDate(1);

    const monthCount = await prisma.equipamentos_dados.count({
      where: {
        equipamento_id: inversor.id,
        timestamp_dados: {
          gte: startOfMonth,
          lt: tomorrow
        }
      }
    });

    console.log('📊 Dados deste mês:', monthCount, 'registros');

    // Check this year's data
    const startOfYear = new Date(today);
    startOfYear.setMonth(0, 1);

    const yearCount = await prisma.equipamentos_dados.count({
      where: {
        equipamento_id: inversor.id,
        timestamp_dados: {
          gte: startOfYear,
          lt: tomorrow
        }
      }
    });

    console.log('📊 Dados deste ano:', yearCount, 'registros');

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkInversor()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });