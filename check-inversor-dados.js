const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkInversorDados() {
  try {
    // Buscar os 3 inversores da Usina Solar 2
    const inversores = await prisma.equipamentos.findMany({
      where: {
        nome: {
          contains: 'Inversor'
        },
        unidade: {
          nome: 'Usina Solar 2'
        }
      },
      select: {
        id: true,
        nome: true,
        topico_mqtt: true,
      }
    });

    console.log('\n=== INVERSORES DA USINA SOLAR 2 ===\n');
    console.log(`Encontrados: ${inversores.length} inversores\n`);

    for (const inversor of inversores) {
      console.log(`📍 ${inversor.nome}`);
      console.log(`   ID: ${inversor.id}`);
      console.log(`   Tópico: ${inversor.topico_mqtt}\n`);

      // Buscar última leitura
      const ultimaLeitura = await prisma.equipamentos_dados.findFirst({
        where: {
          equipamento_id: inversor.id
        },
        orderBy: {
          timestamp_dados: 'desc'
        }
      });

      if (ultimaLeitura) {
        console.log(`   ✓ Última leitura: ${ultimaLeitura.timestamp_dados}`);
        console.log(`   Potência Ativa (kW): ${ultimaLeitura.potencia_ativa_kw}`);
        console.log(`   Energia (kWh): ${ultimaLeitura.energia_kwh}`);
        console.log(`   Dados JSON:`);
        console.log(JSON.stringify(ultimaLeitura.dados, null, 2));
      } else {
        console.log(`   ⚠️ Nenhuma leitura encontrada`);
      }

      console.log('\n---\n');

      // Buscar últimas 3 leituras para ver o padrão
      const ultimasLeituras = await prisma.equipamentos_dados.findMany({
        where: {
          equipamento_id: inversor.id
        },
        orderBy: {
          timestamp_dados: 'desc'
        },
        take: 3
      });

      if (ultimasLeituras.length > 0) {
        console.log(`   Últimas 3 leituras:`);
        ultimasLeituras.forEach((leitura, i) => {
          console.log(`   ${i + 1}. ${leitura.timestamp_dados} - Potência: ${leitura.potencia_ativa_kw} kW, Energia: ${leitura.energia_kwh} kWh`);
        });
      }

      console.log('\n========================================\n');
    }

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkInversorDados();
