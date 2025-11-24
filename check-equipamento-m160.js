const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkEquipamento() {
  const id = 'eq-cmhnk06ka009l2fbkd1o2tyua';
  console.log('========================================');
  console.log('Buscando equipamento:', id);
  console.log('========================================\n');

  const equip = await prisma.equipamentos.findUnique({
    where: { id: id },
    select: {
      id: true,
      tag: true,
      status: true,
      tipo_equipamento_id: true,
      mqtt_habilitado: true,
      topico_mqtt: true
    }
  });

  if (equip) {
    console.log('✅ Equipamento ENCONTRADO:');
    console.log(JSON.stringify(equip, null, 2));
  } else {
    console.log('❌ Equipamento NÃO ENCONTRADO no banco\n');

    // Buscar equipamentos M-160
    console.log('Buscando equipamentos com M-160 no tipo_equipamento_id...');
    const m160s = await prisma.equipamentos.findMany({
      where: {
        tipo_equipamento_id: { contains: 'm-160' }
      },
      select: { id: true, tag: true, tipo_equipamento_id: true, mqtt_habilitado: true },
      take: 10
    });
    console.log(`\nEncontrados ${m160s.length} equipamentos M-160:`);
    m160s.forEach(e => {
      console.log(`  - ID: ${e.id}`);
      console.log(`    Tag: ${e.tag}`);
      console.log(`    Tipo: ${e.tipo_equipamento_id}`);
      console.log(`    MQTT: ${e.mqtt_habilitado ? '✅ Habilitado' : '❌ Desabilitado'}`);
      console.log('');
    });

    // Buscar equipamentos com IDs similares ao que foi buscado
    console.log('\nBuscando IDs similares ao buscado...');
    const similares = await prisma.equipamentos.findMany({
      where: {
        OR: [
          { id: { contains: 'cmhnk' } },
          { id: { startsWith: 'eq-cmhnk' } }
        ]
      },
      select: { id: true, tag: true, tipo_equipamento_id: true },
      take: 10
    });
    if (similares.length > 0) {
      console.log(`Encontrados ${similares.length} equipamentos com ID similar:`);
      similares.forEach(e => console.log(`  - ${e.id} | ${e.tipo_equipamento_id} | ${e.tag}`));
    } else {
      console.log('Nenhum equipamento com ID similar encontrado');
    }
  }

  await prisma.$disconnect();
}

checkEquipamento().catch(console.error);
