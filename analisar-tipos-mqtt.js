const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tipos = await prisma.tipos_equipamentos.findMany({
    include: {
      equipamentos: {
        where: { deleted_at: null },
        select: {
          id: true,
          nome: true,
          mqtt_habilitado: true,
          topico_mqtt: true
        }
      }
    }
  });
  
  console.log('TIPOS DE EQUIPAMENTOS EM USO:');
  console.log('='.repeat(80));
  
  tipos.forEach(tipo => {
    const total = tipo.equipamentos.length;
    const comMqtt = tipo.equipamentos.filter(e => e.mqtt_habilitado).length;
    
    if (total > 0) {
      console.log('');
      console.log(`[${tipo.codigo}] ${tipo.nome}`);
      console.log(`   Categoria atual: ${tipo.categoria}`);
      console.log(`   Total de equipamentos: ${total}`);
      console.log(`   Com MQTT habilitado: ${comMqtt}`);
      
      if (comMqtt > 0) {
        console.log('   MQTT ATIVO - NAO PODE SER EXCLUIDO!');
        tipo.equipamentos
          .filter(e => e.mqtt_habilitado)
          .slice(0, 3)
          .forEach(eq => {
            console.log(`      - ${eq.nome} (topico: ${eq.topico_mqtt || 'N/A'})`);
          });
      }
    }
  });
  
  console.log('');
  console.log('='.repeat(80));
  console.log('');
  console.log('RESUMO:');
  console.log('');
  
  const tiposEmUso = tipos.filter(t => t.equipamentos.length > 0);
  const tiposComMqtt = tipos.filter(t => t.equipamentos.some(e => e.mqtt_habilitado));
  
  console.log(`   Total de tipos cadastrados: ${tipos.length}`);
  console.log(`   Tipos em uso: ${tiposEmUso.length}`);
  console.log(`   Tipos com MQTT ativo: ${tiposComMqtt.length}`);
  console.log('');
  console.log(`   ${tiposComMqtt.length} tipos NAO podem ser excluidos (MQTT ativo)`);
  console.log('');
  
  await prisma.$disconnect();
}

main().catch(console.error);
