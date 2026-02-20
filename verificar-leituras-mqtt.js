// verificar-leituras-mqtt.js
// Script para verificar se há leituras MQTT salvas e se o cálculo de energia está funcionando

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verificarLeituras() {
  console.log('\n🔍 VERIFICANDO LEITURAS MQTT E CÁLCULO DE ENERGIA\n');
  console.log('='.repeat(80));

  try {
    // 1. Buscar equipamentos com leituras
    const equipamentosComLeituras = await prisma.equipamentos_dados.groupBy({
      by: ['equipamento_id'],
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: 10,
    });

    console.log('\n📊 EQUIPAMENTOS COM MAIS LEITURAS (Top 10):');
    console.log('-'.repeat(80));

    if (equipamentosComLeituras.length === 0) {
      console.log('❌ NENHUMA LEITURA MQTT ENCONTRADA NO BANCO!');
      console.log('\n⚠️  O MQTT pode não estar conectado ou os dados não estão sendo salvos.');
      return;
    }

    for (const grupo of equipamentosComLeituras) {
      const equipamento = await prisma.equipamentos.findUnique({
        where: { id: grupo.equipamento_id },
        select: { nome: true, classificacao: true },
      });

      console.log(`\n📦 ${equipamento?.nome || 'Equipamento desconhecido'}`);
      console.log(`   ID: ${grupo.equipamento_id}`);
      console.log(`   Total de leituras: ${grupo._count.id}`);

      // Buscar últimas 5 leituras deste equipamento
      const ultimasLeituras = await prisma.equipamentos_dados.findMany({
        where: { equipamento_id: grupo.equipamento_id },
        select: {
          timestamp_dados: true,
          energia_kwh: true,
          potencia_ativa_kw: true,
          qualidade: true,
          tipo_horario: true,
        },
        orderBy: { timestamp_dados: 'desc' },
        take: 5,
      });

      console.log('\n   Últimas 5 leituras:');
      ultimasLeituras.forEach((leitura, i) => {
        const energia = leitura.energia_kwh ? parseFloat(leitura.energia_kwh.toString()).toFixed(4) : 'null';
        const potencia = leitura.potencia_ativa_kw ? parseFloat(leitura.potencia_ativa_kw.toString()).toFixed(2) : 'null';

        console.log(`   ${i + 1}. ${leitura.timestamp_dados.toISOString()}`);
        console.log(`      Energia: ${energia} kWh | Potência: ${potencia} kW`);
        console.log(`      Qualidade: ${leitura.qualidade || 'N/A'} | Horário: ${leitura.tipo_horario || 'N/A'}`);
      });
    }

    // 2. Estatísticas gerais
    console.log('\n\n📈 ESTATÍSTICAS GERAIS:');
    console.log('='.repeat(80));

    const totalLeituras = await prisma.equipamentos_dados.count();
    const leiturasComEnergia = await prisma.equipamentos_dados.count({
      where: { energia_kwh: { not: null } },
    });
    const leiturasComPotencia = await prisma.equipamentos_dados.count({
      where: { potencia_ativa_kw: { not: null } },
    });

    console.log(`Total de leituras: ${totalLeituras}`);
    console.log(`Leituras com energia calculada: ${leiturasComEnergia}/${totalLeituras} (${((leiturasComEnergia/totalLeituras)*100).toFixed(1)}%)`);
    console.log(`Leituras com potência: ${leiturasComPotencia}/${totalLeituras} (${((leiturasComPotencia/totalLeituras)*100).toFixed(1)}%)`);

    // 3. Verificar leituras de hoje
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const leiturasHoje = await prisma.equipamentos_dados.count({
      where: {
        timestamp_dados: { gte: hoje },
      },
    });

    const leiturasHojeComEnergia = await prisma.equipamentos_dados.count({
      where: {
        timestamp_dados: { gte: hoje },
        energia_kwh: { not: null, gt: 0 },
      },
    });

    console.log(`\nLeituras de hoje: ${leiturasHoje}`);
    console.log(`Leituras de hoje com energia > 0: ${leiturasHojeComEnergia}`);

    // 4. Buscar exemplo de leitura com energia
    console.log('\n\n💡 EXEMPLO DE LEITURA COM ENERGIA:');
    console.log('='.repeat(80));

    const leituraComEnergia = await prisma.equipamentos_dados.findFirst({
      where: {
        energia_kwh: { not: null, gt: 0 },
      },
      include: {
        equipamento: {
          select: { nome: true },
        },
      },
      orderBy: { timestamp_dados: 'desc' },
    });

    if (leituraComEnergia) {
      console.log(`Equipamento: ${leituraComEnergia.equipamento.nome}`);
      console.log(`Timestamp: ${leituraComEnergia.timestamp_dados.toISOString()}`);
      console.log(`Energia: ${parseFloat(leituraComEnergia.energia_kwh.toString()).toFixed(4)} kWh`);
      console.log(`Potência: ${leituraComEnergia.potencia_ativa_kw ? parseFloat(leituraComEnergia.potencia_ativa_kw.toString()).toFixed(2) : 'N/A'} kW`);
      console.log(`Qualidade: ${leituraComEnergia.qualidade}`);
      console.log(`Tipo Horário: ${leituraComEnergia.tipo_horario}`);
    } else {
      console.log('❌ Nenhuma leitura com energia > 0 encontrada!');
    }

    // 5. Verificar se há leituras sem energia (primeira leitura)
    const leiturasIniciais = await prisma.equipamentos_dados.count({
      where: {
        energia_kwh: null,
      },
    });

    if (leiturasIniciais > 0) {
      console.log(`\n⚠️  ${leiturasIniciais} leituras sem energia (primeira leitura de cada equipamento)`);
    }

    console.log('\n✅ VERIFICAÇÃO CONCLUÍDA\n');

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

verificarLeituras();
