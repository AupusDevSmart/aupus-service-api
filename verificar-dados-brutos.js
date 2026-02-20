// verificar-dados-brutos.js
// Verificar como os dados MQTT estão sendo salvos

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verificarDados() {
  console.log('\n🔍 VERIFICANDO DADOS BRUTOS DO MQTT\n');
  console.log('='.repeat(80));

  try {
    // Buscar uma leitura recente de um inversor
    const leituraInversor = await prisma.equipamentos_dados.findFirst({
      where: {
        equipamento: {
          nome: { contains: 'Inversor' },
        },
      },
      orderBy: { timestamp_dados: 'desc' },
      take: 1,
    });

    if (leituraInversor) {
      console.log('\n📦 LEITURA DE INVERSOR:');
      console.log('-'.repeat(80));
      console.log('Timestamp:', leituraInversor.timestamp_dados);
      console.log('Energia kWh:', leituraInversor.energia_kwh);
      console.log('Potência kW:', leituraInversor.potencia_ativa_kw);
      console.log('Qualidade:', leituraInversor.qualidade);
      console.log('Tipo Horário:', leituraInversor.tipo_horario);
      console.log('\nPayload MQTT (dados):');
      console.log(JSON.stringify(leituraInversor.dados, null, 2));
    }

    // Buscar uma leitura recente de M160
    const leituraM160 = await prisma.equipamentos_dados.findFirst({
      where: {
        equipamento: {
          nome: { contains: 'M160' },
        },
      },
      orderBy: { timestamp_dados: 'desc' },
      take: 1,
    });

    if (leituraM160) {
      console.log('\n\n📦 LEITURA DE M-160:');
      console.log('-'.repeat(80));
      console.log('Timestamp:', leituraM160.timestamp_dados);
      console.log('Energia kWh:', leituraM160.energia_kwh);
      console.log('Potência kW:', leituraM160.potencia_ativa_kw);
      console.log('Qualidade:', leituraM160.qualidade);
      console.log('Tipo Horário:', leituraM160.tipo_horario);
      console.log('\nPayload MQTT (dados):');
      console.log(JSON.stringify(leituraM160.dados, null, 2));
    }

    console.log('\n✅ VERIFICAÇÃO CONCLUÍDA\n');

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

verificarDados();
