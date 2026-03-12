const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkMqttData() {
  console.log('========================================');
  console.log('Verificando Dados MQTT no Banco Local');
  console.log('========================================');
  console.log('');

  try {
    await prisma.$connect();
    console.log('✓ Conectado ao banco local');
    console.log('');

    // Verifica total de equipamentos_dados
    const totalDados = await prisma.equipamentos_dados.count();
    console.log(`Total de registros em equipamentos_dados: ${totalDados}`);
    console.log('');

    // Verifica registros recentes (últimos 10 minutos)
    const dezMinutosAtras = new Date(Date.now() - 10 * 60 * 1000);
    const dadosRecentes = await prisma.equipamentos_dados.count({
      where: {
        created_at: {
          gte: dezMinutosAtras
        }
      }
    });
    console.log(`Registros criados nos últimos 10 minutos: ${dadosRecentes}`);
    console.log('');

    // Busca os 5 registros mais recentes
    const ultimosDados = await prisma.equipamentos_dados.findMany({
      take: 5,
      orderBy: {
        created_at: 'desc'
      },
      select: {
        id: true,
        equipamento_id: true,
        dados: true,
        created_at: true
      }
    });

    if (ultimosDados.length > 0) {
      console.log('Últimos 5 registros MQTT salvos:');
      console.log('----------------------------------------');
      ultimosDados.forEach((dado, index) => {
        console.log(`${index + 1}. ID: ${dado.id}`);
        console.log(`   Equipamento: ${dado.equipamento_id}`);
        console.log(`   Data: ${dado.created_at}`);
        console.log(`   Dados: ${JSON.stringify(dado.dados).substring(0, 100)}...`);
        console.log('');
      });
    } else {
      console.log('⚠ Nenhum dado MQTT encontrado!');
      console.log('');
      console.log('Possíveis causas:');
      console.log('1. MQTT_MODE está em "development" (não salva dados)');
      console.log('2. Backend não está conectado ao broker MQTT');
      console.log('3. Não há equipamentos publicando dados');
      console.log('');
    }

    // Verifica se há equipamentos cadastrados
    const totalEquipamentos = await prisma.equipamentos.count();
    console.log(`Total de equipamentos cadastrados: ${totalEquipamentos}`);

  } catch (error) {
    console.error('');
    console.error('ERRO:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkMqttData();
