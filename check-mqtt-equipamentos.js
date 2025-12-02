const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Verificando equipamentos com MQTT habilitado...\n');

  // Contar equipamentos
  const totalEquipamentos = await prisma.equipamentos.count({
    where: { deleted_at: null }
  });

  const equipamentosComMqtt = await prisma.equipamentos.count({
    where: {
      deleted_at: null,
      mqtt_habilitado: true
    }
  });

  console.log(`📊 Total de equipamentos: ${totalEquipamentos}`);
  console.log(`✅ Equipamentos com MQTT habilitado: ${equipamentosComMqtt}`);
  console.log(`❌ Equipamentos com MQTT desabilitado: ${totalEquipamentos - equipamentosComMqtt}\n`);

  // Listar alguns equipamentos com MQTT habilitado
  const equipamentos = await prisma.equipamentos.findMany({
    where: {
      deleted_at: null,
      mqtt_habilitado: true
    },
    take: 10,
    select: {
      id: true,
      nome: true,
      mqtt_habilitado: true,
      topico_mqtt: true,
      classificacao: true,
      tipo_equipamento_id: true,
      unidade: {
        select: {
          id: true,
          nome: true
        }
      },
      tipo_equipamento_rel: {
        select: {
          codigo: true,
          nome: true
        }
      }
    }
  });

  if (equipamentos.length > 0) {
    console.log('📋 Primeiros equipamentos com MQTT habilitado:\n');
    equipamentos.forEach((eq, idx) => {
      console.log(`  ${idx + 1}. ${eq.nome}`);
      console.log(`     ID: ${eq.id.trim()}`);
      console.log(`     Tipo: ${eq.tipo_equipamento_rel?.codigo || 'N/A'}`);
      console.log(`     Classificação: ${eq.classificacao}`);
      console.log(`     Tópico MQTT: ${eq.topico_mqtt || 'N/A'}`);
      console.log(`     Unidade: ${eq.unidade?.nome || 'N/A'} (${eq.unidade?.id?.trim() || 'N/A'})`);
      console.log('');
    });
  } else {
    console.log('⚠️ Nenhum equipamento encontrado com MQTT habilitado!\n');
    console.log('   Para habilitar MQTT em um equipamento, use:');
    console.log('   UPDATE equipamentos SET mqtt_habilitado = true, topico_mqtt = \'aupus/equipamento/ID\' WHERE id = \'seu_id_aqui\';\n');
  }
}

main()
  .catch((e) => {
    console.error('❌ Erro:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
