import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateP666Topic() {
  console.log('🔧 ATUALIZANDO TÓPICO DO P666\n');

  const novoTopico = 'ISOFEN/GO/SUP_PRIME/ELETROPOSTO/CHINT/1';

  // Atualizar o tópico
  const result = await prisma.equipamentos.updateMany({
    where: {
      OR: [
        { topico_mqtt: { contains: 'PRIME' } },
        { nome: { contains: 'P666' } },
        { tag: { contains: 'P666' } }
      ]
    },
    data: {
      topico_mqtt: novoTopico
    }
  });

  console.log(`✅ Atualizado ${result.count} equipamento(s)`);
  console.log(`📡 Novo tópico: ${novoTopico}\n`);

  // Verificar
  const equipamento: any = await prisma.$queryRaw`
    SELECT id, nome, tag, topico_mqtt, mqtt_habilitado
    FROM equipamentos
    WHERE topico_mqtt = ${novoTopico}
  `;

  if (equipamento.length > 0) {
    console.log('📋 EQUIPAMENTO ATUALIZADO:');
    console.log(`   Nome: ${equipamento[0].nome}`);
    console.log(`   Tag: ${equipamento[0].tag}`);
    console.log(`   Tópico: ${equipamento[0].topico_mqtt}`);
    console.log(`   MQTT Habilitado: ${equipamento[0].mqtt_habilitado ? '✅ SIM' : '❌ NÃO'}`);
  }
}

updateP666Topic()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
