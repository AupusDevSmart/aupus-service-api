import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function countTopics() {
  const equipamentos: any[] = await prisma.$queryRaw`
    SELECT id, nome, tag, topico_mqtt, mqtt_habilitado
    FROM equipamentos
    WHERE mqtt_habilitado = true
      AND topico_mqtt IS NOT NULL
      AND topico_mqtt != ''
    ORDER BY nome
  `;

  console.log(`\n📊 Total de equipamentos com MQTT habilitado: ${equipamentos.length}\n`);

  equipamentos.forEach((eq, index) => {
    const icon = eq.topico_mqtt.includes('ISOFEN') ? '🆕' : '📡';
    console.log(`${index + 1}. ${icon} ${eq.nome} (${eq.tag || 'N/A'})`);
    console.log(`   Tópico: ${eq.topico_mqtt}\n`);
  });

  // Verificar tópicos duplicados
  const topicos = equipamentos.map(e => e.topico_mqtt);
  const duplicados = topicos.filter((t, i) => topicos.indexOf(t) !== i);

  if (duplicados.length > 0) {
    console.log('\n⚠️ ATENÇÃO: Tópicos duplicados encontrados:');
    duplicados.forEach(t => console.log(`   - ${t}`));
  }
}

countTopics()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
