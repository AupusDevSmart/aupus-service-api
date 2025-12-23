const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Buscar equipamento com tópico NSA/bombas/1
    const equipamento = await prisma.equipamentos.findFirst({
      where: {
        topico_mqtt: 'NSA/bombas/1'
      },
      select: {
        id: true,
        nome: true,
        topico_mqtt: true,
        tipo_equipamento_rel: {
          select: {
            codigo: true,
            nome: true
          }
        }
      }
    });

    if (equipamento) {
      console.log('✅ Equipamento encontrado:');
      console.log('ID:', equipamento.id);
      console.log('Nome:', equipamento.nome);
      console.log('Tópico:', equipamento.topico_mqtt);
      console.log('Tipo:', equipamento.tipo_equipamento_rel?.codigo, '-', equipamento.tipo_equipamento_rel?.nome);

      // Buscar últimos 5 registros de dados deste equipamento
      console.log('\n📊 Últimos 5 registros salvos:');
      const dados = await prisma.equipamentos_dados.findMany({
        where: {
          equipamento_id: equipamento.id
        },
        orderBy: {
          timestamp_dados: 'desc'
        },
        take: 5,
        select: {
          id: true,
          timestamp_dados: true,
          dados: true,
          num_leituras: true,
          qualidade: true,
          fonte: true
        }
      });

      console.log('Total de registros encontrados:', dados.length);

      dados.forEach((d, i) => {
        console.log(`\n--- Registro ${i + 1} ---`);
        console.log('ID:', d.id);
        console.log('Timestamp:', d.timestamp_dados);
        console.log('Num Leituras:', d.num_leituras);
        console.log('Qualidade:', d.qualidade);
        console.log('Fonte:', d.fonte);
        console.log('Dados:');
        console.log(JSON.stringify(d.dados, null, 2));
      });
    } else {
      console.log('❌ Nenhum equipamento encontrado com tópico NSA/bombas/1');
    }
  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
