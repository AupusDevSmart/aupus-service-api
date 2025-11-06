const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkLatestData() {
  try {
    const latestData = await prisma.equipamentos_dados.findFirst({
      where: {
        equipamento_id: 'cmhcfyoj30003jqo8bhhaexlp'
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    if (latestData) {
      console.log('========== DADOS MAIS RECENTES DO BANCO ==========');
      console.log('Timestamp:', latestData.timestamp);
      console.log('\nEstrutura dos dados:');
      console.log(JSON.stringify(latestData.dados, null, 2));

      // Verificar se tem estrutura aninhada
      if (latestData.dados.power && typeof latestData.dados.power === 'object') {
        console.log('\n✅ ESTRUTURA ANINHADA DETECTADA!');
        console.log('Power:', latestData.dados.power);
        console.log('Voltage:', latestData.dados.voltage);
        console.log('Current:', latestData.dados.current);
        console.log('Temperature:', latestData.dados.temperature);
        if (latestData.dados.dc) {
          console.log('DC (MPPTs e Strings):');
          console.log(JSON.stringify(latestData.dados.dc, null, 2));
        }
      } else {
        console.log('\n⚠️  ESTRUTURA LEGADA (ACHATADA)');
      }
    } else {
      console.log('Nenhum dado encontrado');
    }
  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkLatestData();
