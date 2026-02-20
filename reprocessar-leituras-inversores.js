// reprocessar-leituras-inversores.js
// Reprocessar leituras de inversores para preencher energia_kwh e potencia_ativa_kw

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function reprocessarLeituras() {
  console.log('\n🔄 REPROCESSANDO LEITURAS DE INVERSORES\n');
  console.log('='.repeat(80));

  try {
    // Data de hoje (00:00:00)
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    console.log(`\n📅 Reprocessando leituras desde: ${hoje.toISOString()}`);

    // Buscar todas as leituras de hoje que precisam ser reprocessadas
    // (têm dados mas não têm energia_kwh ou potencia_ativa_kw)
    const leituras = await prisma.equipamentos_dados.findMany({
      where: {
        timestamp_dados: { gte: hoje },
        OR: [
          { energia_kwh: null },
          { potencia_ativa_kw: null },
        ],
      },
      select: {
        id: true,
        equipamento_id: true,
        dados: true,
        timestamp_dados: true,
      },
      orderBy: { timestamp_dados: 'asc' },
    });

    console.log(`\n📊 Total de leituras para reprocessar: ${leituras.length}`);

    if (leituras.length === 0) {
      console.log('\n✅ Nenhuma leitura precisa ser reprocessada!');
      return;
    }

    let processadas = 0;
    let comEnergia = 0;
    let comPotencia = 0;

    console.log('\n🔄 Processando...\n');

    for (const leitura of leituras) {
      const dados = leitura.dados;
      let energiaKwh = null;
      let potenciaAtivaKw = null;

      // Extrair energia (inversores: energy.period_energy_kwh)
      if (dados?.energy?.period_energy_kwh !== undefined && dados.energy.period_energy_kwh !== null) {
        energiaKwh = parseFloat(dados.energy.period_energy_kwh);
        if (!isNaN(energiaKwh) && energiaKwh >= 0) {
          comEnergia++;
        } else {
          energiaKwh = null;
        }
      }

      // Extrair potência (inversores: power.active_total em W)
      if (dados?.power?.active_total !== undefined && dados.power.active_total !== null) {
        const potenciaW = parseFloat(dados.power.active_total);
        if (!isNaN(potenciaW) && potenciaW >= 0) {
          potenciaAtivaKw = potenciaW / 1000; // W para kW
          comPotencia++;
        }
      }

      // Atualizar apenas se encontrou pelo menos um dos campos
      if (energiaKwh !== null || potenciaAtivaKw !== null) {
        await prisma.equipamentos_dados.update({
          where: { id: leitura.id },
          data: {
            energia_kwh: energiaKwh,
            potencia_ativa_kw: potenciaAtivaKw,
          },
        });

        processadas++;

        // Log a cada 100 leituras
        if (processadas % 100 === 0) {
          console.log(`   Processadas: ${processadas}/${leituras.length} (${((processadas/leituras.length)*100).toFixed(1)}%)`);
        }
      }
    }

    console.log('\n✅ REPROCESSAMENTO CONCLUÍDO!\n');
    console.log('='.repeat(80));
    console.log(`Total de leituras processadas: ${processadas}`);
    console.log(`  - Com energia preenchida: ${comEnergia}`);
    console.log(`  - Com potência preenchida: ${comPotencia}`);

    // Verificação final
    const leiturasRestantes = await prisma.equipamentos_dados.count({
      where: {
        timestamp_dados: { gte: hoje },
        OR: [
          { energia_kwh: null },
          { potencia_ativa_kw: null },
        ],
      },
    });

    console.log(`\nLeituras ainda sem energia/potência: ${leiturasRestantes}`);

    if (leiturasRestantes === 0) {
      console.log('\n🎉 TODAS AS LEITURAS DE HOJE ESTÃO COMPLETAS!');
    }

    // Mostrar exemplo de leitura processada
    const exemplo = await prisma.equipamentos_dados.findFirst({
      where: {
        timestamp_dados: { gte: hoje },
        energia_kwh: { not: null, gt: 0 },
      },
      include: {
        equipamento: {
          select: { nome: true },
        },
      },
      orderBy: { timestamp_dados: 'desc' },
    });

    if (exemplo) {
      console.log('\n💡 EXEMPLO DE LEITURA PROCESSADA:');
      console.log('-'.repeat(80));
      console.log(`Equipamento: ${exemplo.equipamento.nome}`);
      console.log(`Timestamp: ${exemplo.timestamp_dados.toISOString()}`);
      console.log(`Energia: ${parseFloat(exemplo.energia_kwh.toString()).toFixed(4)} kWh`);
      console.log(`Potência: ${exemplo.potencia_ativa_kw ? parseFloat(exemplo.potencia_ativa_kw.toString()).toFixed(2) : 'N/A'} kW`);
    }

    console.log('\n✅ Pronto! Agora o cálculo de custos deve funcionar.\n');

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

reprocessarLeituras();
