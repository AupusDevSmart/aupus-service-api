const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAllMqttEquipments() {
  try {
    // Buscar todos equipamentos com MQTT habilitado
    const equipamentos = await prisma.equipamentos.findMany({
      where: {
        mqtt_habilitado: true,
        deleted_at: null,
        topico_mqtt: { not: null }
      },
      select: {
        id: true,
        nome: true,
        topico_mqtt: true,
        tipo_equipamento_rel: {
          select: {
            nome: true,
            codigo: true
          }
        }
      },
      orderBy: {
        nome: 'asc'
      }
    });

    console.log('📡 Total de equipamentos com MQTT habilitado:', equipamentos.length);
    console.log('');

    for (let idx = 0; idx < equipamentos.length; idx++) {
      const eq = equipamentos[idx];
      console.log(`[${idx + 1}] ${eq.nome}`);
      console.log(`    Tipo: ${eq.tipo_equipamento_rel?.codigo || 'N/A'}`);
      console.log(`    Tópico: ${eq.topico_mqtt}`);
      console.log(`    ID: ${eq.id.trim()}`);

      // Verificar se tem dados
      const count = await prisma.equipamentos_dados.count({
        where: {
          equipamento_id: eq.id.trim()
        }
      });

      if (count > 0) {
        const ultimoDado = await prisma.equipamentos_dados.findFirst({
          where: {
            equipamento_id: eq.id.trim()
          },
          orderBy: {
            timestamp_dados: 'desc'
          },
          select: {
            timestamp_dados: true
          }
        });
        console.log(`    ✅ ${count} dados salvos | Último: ${ultimoDado.timestamp_dados}`);
      } else {
        console.log(`    ⚠️ Nenhum dado MQTT recebido ainda`);
      }
      console.log('');
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Erro:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkAllMqttEquipments();
