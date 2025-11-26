const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedGraficosInversores() {
  console.log('🚀 Iniciando seed de dados para gráficos de inversores...');

  try {
    // ID do inversor que vamos popular
    const equipamentoId = 'cmhddtv0h0024jqo8h4dzm4gq';

    // Limpar dados antigos
    console.log('🧹 Limpando dados antigos...');
    await prisma.equipamentos_dados.deleteMany({
      where: {
        equipamento_id: equipamentoId
      }
    });

    console.log('📊 Gerando dados para os últimos 30 dias...');

    const agora = new Date();
    const dados = [];

    // Gerar dados para os últimos 30 dias
    for (let dia = 30; dia >= 0; dia--) {
      const dataBase = new Date(agora);
      dataBase.setDate(dataBase.getDate() - dia);
      dataBase.setHours(0, 0, 0, 0);

      // Gerar dados de 6h às 18h (horário solar)
      for (let hora = 6; hora <= 18; hora++) {
        for (let minuto = 0; minuto < 60; minuto += 5) { // A cada 5 minutos
          const timestamp = new Date(dataBase);
          timestamp.setHours(hora, minuto, 0, 0);

          // Calcular potência com curva solar simulada
          let potencia = 0;
          if (hora >= 6 && hora <= 18) {
            const horaDecimal = hora + minuto / 60;
            // Curva gaussiana para simular produção solar
            const pico = 12; // Meio dia
            const sigma = 3;
            const maxPotencia = 800 + Math.random() * 200; // 800-1000 kW
            potencia = maxPotencia * Math.exp(-Math.pow(horaDecimal - pico, 2) / (2 * sigma * sigma));

            // Adicionar variação aleatória
            potencia = potencia * (0.9 + Math.random() * 0.2);

            // Simular dias nublados (20% de chance)
            if (Math.random() < 0.2) {
              potencia = potencia * (0.3 + Math.random() * 0.4);
            }
          }

          // Calcular energia (kWh) - potência * intervalo em horas
          const energia = potencia * (5 / 60); // 5 minutos = 5/60 horas

          dados.push({
            equipamento_id: equipamentoId,
            timestamp_dados: timestamp,
            dados: JSON.stringify({
              power: {
                active_total: potencia * 1000, // Converter para Watts
                power_factor: 0.92 + Math.random() * 0.06
              },
              energy: {
                period_energy_kwh: energia,
                total_energy_mwh: Math.random() * 1000
              },
              voltage: {
                ac: {
                  ab: 380 + Math.random() * 10,
                  bc: 380 + Math.random() * 10,
                  ca: 380 + Math.random() * 10,
                  an: 220 + Math.random() * 5,
                  bn: 220 + Math.random() * 5,
                  cn: 220 + Math.random() * 5
                }
              },
              current: {
                ac: {
                  a: potencia / 0.38 / 3 * (0.9 + Math.random() * 0.2),
                  b: potencia / 0.38 / 3 * (0.9 + Math.random() * 0.2),
                  c: potencia / 0.38 / 3 * (0.9 + Math.random() * 0.2)
                }
              },
              temperature: {
                internal: 35 + Math.random() * 15,
                heatsink: 40 + Math.random() * 20
              },
              status: {
                operational: potencia > 10 ? 'running' : 'standby',
                alarms: [],
                warnings: []
              }
            }),
            num_leituras: 1,
            qualidade: 'bom'
          });
        }
      }
    }

    console.log(`📦 Inserindo ${dados.length} registros no banco...`);

    // Inserir em lotes para melhor performance
    const batchSize = 100;
    for (let i = 0; i < dados.length; i += batchSize) {
      const batch = dados.slice(i, i + batchSize);
      await prisma.equipamentos_dados.createMany({
        data: batch,
        skipDuplicates: true
      });
      console.log(`   ✅ Inseridos ${Math.min(i + batchSize, dados.length)} de ${dados.length} registros`);
    }

    // Verificar dados inseridos
    const count = await prisma.equipamentos_dados.count({
      where: {
        equipamento_id: equipamentoId
      }
    });

    console.log(`\n✅ Seed concluído! ${count} registros de dados para o inversor.`);

    // Mostrar resumo dos dados
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);

    const dadosHoje = await prisma.equipamentos_dados.count({
      where: {
        equipamento_id: equipamentoId,
        timestamp_dados: {
          gte: hoje,
          lt: amanha
        }
      }
    });

    console.log(`📊 Dados de hoje: ${dadosHoje} registros`);

    // Dados do mês
    const inicioMes = new Date(hoje);
    inicioMes.setDate(1);

    const dadosMes = await prisma.equipamentos_dados.count({
      where: {
        equipamento_id: equipamentoId,
        timestamp_dados: {
          gte: inicioMes,
          lt: amanha
        }
      }
    });

    console.log(`📊 Dados deste mês: ${dadosMes} registros`);

  } catch (error) {
    console.error('❌ Erro ao executar seed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar seed
seedGraficosInversores()
  .then(() => {
    console.log('🎉 Processo finalizado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  });