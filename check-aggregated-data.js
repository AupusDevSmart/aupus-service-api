const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAggregatedData() {
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
    console.log('');

    // Check for aggregated data (with num_leituras)
    console.log('🔍 Verificando dados agregados (com num_leituras)...');
    const aggregatedCount = await prisma.equipamentos_dados.count({
      where: {
        equipamento_id: inversor.id,
        num_leituras: {
          not: null
        }
      }
    });

    console.log('   Total de registros agregados:', aggregatedCount);

    // Check for raw data (without num_leituras)
    console.log('\n🔍 Verificando dados brutos (sem num_leituras)...');
    const rawCount = await prisma.equipamentos_dados.count({
      where: {
        equipamento_id: inversor.id,
        num_leituras: null
      }
    });

    console.log('   Total de registros brutos:', rawCount);

    // Get samples of each type
    if (aggregatedCount > 0) {
      console.log('\n📊 Amostra de dados agregados:');
      const aggregatedSamples = await prisma.equipamentos_dados.findMany({
        where: {
          equipamento_id: inversor.id,
          num_leituras: {
            not: null
          }
        },
        orderBy: {
          timestamp_dados: 'desc'
        },
        take: 3
      });

      aggregatedSamples.forEach(record => {
        console.log('   -', record.timestamp_dados.toISOString());
        console.log('     num_leituras:', record.num_leituras);
        console.log('     qualidade:', record.qualidade);
        const dados = typeof record.dados === 'string' ? JSON.parse(record.dados) : record.dados;
        if (dados.power) {
          console.log('     power:', dados.power);
        }
        if (dados.energy) {
          console.log('     energy:', dados.energy);
        }
      });
    }

    if (rawCount > 0) {
      console.log('\n📊 Amostra de dados brutos:');
      const rawSamples = await prisma.equipamentos_dados.findMany({
        where: {
          equipamento_id: inversor.id,
          num_leituras: null
        },
        orderBy: {
          timestamp_dados: 'desc'
        },
        take: 3
      });

      rawSamples.forEach(record => {
        console.log('   -', record.timestamp_dados.toISOString());
        console.log('     num_leituras:', record.num_leituras);
        console.log('     qualidade:', record.qualidade);
        const dados = typeof record.dados === 'string' ? JSON.parse(record.dados) : record.dados;
        if (dados.power) {
          console.log('     power:', dados.power);
        }
        if (dados.energy) {
          console.log('     energy:', dados.energy);
        }
      });
    }

    console.log('\n❗ IMPORTANTE:');
    if (aggregatedCount === 0) {
      console.log('   Os gráficos procuram apenas dados agregados (com num_leituras).');
      console.log('   Como não há dados agregados, os gráficos não mostrarão nada.');
      console.log('   Os dados MQTT brutos precisam ser agregados para aparecer nos gráficos.');
    } else {
      console.log('   Existem dados agregados que deveriam aparecer nos gráficos.');
    }

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAggregatedData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });