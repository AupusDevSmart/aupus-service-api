const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkMqttUnidades() {
  try {
    // Buscar todas as unidades com seus equipamentos
    const unidades = await prisma.unidades.findMany({
      where: {
        deleted_at: null
      },
      select: {
        id: true,
        nome: true,
        equipamentos: {
          where: {
            deleted_at: null,
            topico_mqtt: {
              not: null
            }
          },
          select: {
            id: true,
            nome: true,
            topico_mqtt: true,
            mqtt_habilitado: true,
          }
        }
      },
      orderBy: {
        nome: 'asc'
      }
    });

    console.log('\n=== UNIDADES COM EQUIPAMENTOS MQTT ===\n');

    const unidadesComMqtt = unidades.filter(u => u.equipamentos.length > 0);

    console.log(`Total de unidades: ${unidades.length}`);
    console.log(`Unidades COM equipamentos MQTT: ${unidadesComMqtt.length}\n`);

    for (const unidade of unidadesComMqtt) {
      console.log(`📍 ${unidade.nome}`);
      console.log(`   ID: ${unidade.id}`);
      console.log(`   Equipamentos MQTT: ${unidade.equipamentos.length}`);

      for (const eq of unidade.equipamentos) {
        // Verificar se tem dados recentes (última hora)
        const horaAtras = new Date(Date.now() - 60 * 60 * 1000);
        const dadosRecentes = await prisma.equipamentos_dados.count({
          where: {
            equipamento_id: eq.id,
            timestamp_dados: {
              gte: horaAtras
            }
          }
        });

        const totalDados = await prisma.equipamentos_dados.count({
          where: {
            equipamento_id: eq.id
          }
        });

        console.log(`   - ${eq.nome}`);
        console.log(`     Tópico: ${eq.topico_mqtt}`);
        console.log(`     MQTT Habilitado: ${eq.mqtt_habilitado ? 'SIM' : 'NÃO'}`);
        console.log(`     Total de dados: ${totalDados}`);
        console.log(`     Dados na última hora: ${dadosRecentes}`);
      }
      console.log('');
    }

    // Verificar quantas unidades têm dados RECENTES (última hora)
    console.log('\n=== ANÁLISE DE DADOS RECENTES ===\n');

    const horaAtras = new Date(Date.now() - 60 * 60 * 1000);
    const unidadesComDadosRecentes = [];

    for (const unidade of unidades) {
      const equipamentosIds = unidade.equipamentos.map(e => e.id);

      if (equipamentosIds.length === 0) continue;

      const dadosRecentes = await prisma.equipamentos_dados.count({
        where: {
          equipamento_id: {
            in: equipamentosIds
          },
          timestamp_dados: {
            gte: horaAtras
          }
        }
      });

      if (dadosRecentes > 0) {
        unidadesComDadosRecentes.push({
          nome: unidade.nome,
          qtdDados: dadosRecentes
        });
      }
    }

    console.log(`Unidades com dados recentes (última hora): ${unidadesComDadosRecentes.length}`);
    unidadesComDadosRecentes.forEach(u => {
      console.log(`  - ${u.nome}: ${u.qtdDados} leituras`);
    });

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkMqttUnidades();
