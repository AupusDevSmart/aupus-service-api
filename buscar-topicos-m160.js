const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('\n📡 TÓPICOS MQTT DOS EQUIPAMENTOS M-160:\n');
  console.log('='.repeat(80));

  const equipamentos = await prisma.equipamentos.findMany({
    where: {
      tipo_equipamento: {
        in: ['M160', 'METER_M160', 'M-160']
      }
    },
    select: {
      id: true,
      nome: true,
      topico_mqtt: true,
      unidade: {
        select: {
          nome: true
        }
      }
    }
  });

  equipamentos.forEach(eq => {
    console.log(`\n📊 ${eq.nome}`);
    console.log(`   Unidade: ${eq.unidade?.nome || 'N/A'}`);
    console.log(`   ID: ${eq.id}`);
    console.log(`   📡 Tópico MQTT: ${eq.topico_mqtt || 'NÃO CONFIGURADO'}`);
  });

  console.log('\n' + '='.repeat(80));
  await prisma.$disconnect();
}

main().catch(console.error);
