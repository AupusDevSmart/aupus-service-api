const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Verificando estrutura de dados MQTT...\n');

  try {
    // Buscar um tipo com MQTT ativo (METER_M160)
    const m160 = await prisma.tipos_equipamentos.findFirst({
      where: { codigo: 'METER_M160' }
    });

    console.log('📊 Estrutura completa do METER_M160:');
    console.log(JSON.stringify(m160, null, 2));

    // Verificar se existe alguma coluna relacionada a MQTT
    const raw = await prisma.$queryRaw`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'tipos_equipamentos'
        AND column_name LIKE '%mqtt%'
    `;

    console.log('\n📋 Colunas relacionadas a MQTT:');
    console.log(JSON.stringify(raw, null, 2));

    // Buscar equipamentos com MQTT
    const equipMqtt = await prisma.equipamentos.findFirst({
      where: {
        mqtt_habilitado: true
      },
      include: {
        tipo_equipamento_rel: true
      }
    });

    console.log('\n🔌 Exemplo de equipamento com MQTT:');
    console.log(JSON.stringify(equipMqtt, null, 2));

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
