// verificar-equipamento-especifico.js
// Verificar dados de um equipamento específico

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verificar() {
  // Buscar um inversor com energia > 0
  const inversorComEnergia = await prisma.equipamentos_dados.findFirst({
    where: {
      timestamp_dados: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Últimas 24h
      energia_kwh: { gt: 0 },
    },
    select: { equipamento_id: true },
  });

  const equipamentoId = inversorComEnergia?.equipamento_id || 'cmllgigy800cujqctbxnx1iq5'; // Fallback para CHINT

  console.log('\n🔍 VERIFICANDO EQUIPAMENTO:', equipamentoId, '\n');
  console.log('='.repeat(80));

  try {
    // Buscar equipamento
    const equipamento = await prisma.equipamentos.findUnique({
      where: { id: equipamentoId },
      include: {
        unidade: {
          include: {
            concessionaria: true,
          },
        },
      },
    });

    if (!equipamento) {
      console.log('❌ Equipamento não encontrado!');
      return;
    }

    console.log('\n📦 EQUIPAMENTO:', equipamento.nome);
    console.log('Classificação:', equipamento.classificacao);
    console.log('MQTT Habilitado:', equipamento.mqtt_habilitado);
    console.log('Tópico MQTT:', equipamento.topico_mqtt);

    if (equipamento.unidade) {
      console.log('\n🏢 UNIDADE:', equipamento.unidade.nome);
      console.log('Grupo:', equipamento.unidade.grupo);
      console.log('Subgrupo:', equipamento.unidade.subgrupo);
      console.log('Irrigante:', equipamento.unidade.irrigante);

      if (equipamento.unidade.concessionaria) {
        console.log('\n⚡ CONCESSIONÁRIA:', equipamento.unidade.concessionaria.nome);
      }
    }

    // Buscar últimas 10 leituras
    const leituras = await prisma.equipamentos_dados.findMany({
      where: { equipamento_id: equipamentoId },
      orderBy: { timestamp_dados: 'desc' },
      take: 10,
    });

    console.log('\n\n📊 ÚLTIMAS 10 LEITURAS:');
    console.log('='.repeat(80));

    leituras.forEach((l, i) => {
      const energia = l.energia_kwh ? parseFloat(l.energia_kwh.toString()).toFixed(4) : 'null';
      const potencia = l.potencia_ativa_kw ? parseFloat(l.potencia_ativa_kw.toString()).toFixed(2) : 'null';

      console.log(`\n${i + 1}. ${l.timestamp_dados.toISOString()}`);
      console.log(`   Energia: ${energia} kWh | Potência: ${potencia} kW`);
      console.log(`   Qualidade: ${l.qualidade} | Tipo Horário: ${l.tipo_horario || 'null'}`);

      // Mostrar dados brutos da primeira leitura
      if (i === 0 && l.dados) {
        console.log('\n   Dados MQTT (resumo):');
        if (l.dados.energy) {
          console.log(`   - energy.period_energy_kwh: ${l.dados.energy.period_energy_kwh}`);
          console.log(`   - energy.total_yield: ${l.dados.energy.total_yield}`);
          console.log(`   - energy.daily_yield: ${l.dados.energy.daily_yield}`);
        }
        if (l.dados.power) {
          console.log(`   - power.active_total: ${l.dados.power.active_total} W`);
        }
      }
    });

    // Estatísticas de hoje
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const totalHoje = await prisma.equipamentos_dados.count({
      where: {
        equipamento_id: equipamentoId,
        timestamp_dados: { gte: hoje },
      },
    });

    const comEnergiaHoje = await prisma.equipamentos_dados.count({
      where: {
        equipamento_id: equipamentoId,
        timestamp_dados: { gte: hoje },
        energia_kwh: { not: null },
      },
    });

    const comEnergiaPositivaHoje = await prisma.equipamentos_dados.count({
      where: {
        equipamento_id: equipamentoId,
        timestamp_dados: { gte: hoje },
        energia_kwh: { gt: 0 },
      },
    });

    console.log('\n\n📈 ESTATÍSTICAS DE HOJE:');
    console.log('='.repeat(80));
    console.log(`Total de leituras: ${totalHoje}`);
    console.log(`Com energia_kwh não nulo: ${comEnergiaHoje}/${totalHoje}`);
    console.log(`Com energia_kwh > 0: ${comEnergiaPositivaHoje}/${totalHoje}`);

    // Soma total de energia de hoje
    const somaEnergia = await prisma.equipamentos_dados.aggregate({
      where: {
        equipamento_id: equipamentoId,
        timestamp_dados: { gte: hoje },
        energia_kwh: { not: null },
      },
      _sum: {
        energia_kwh: true,
      },
    });

    console.log(`Soma total de energia hoje: ${somaEnergia._sum.energia_kwh || 0} kWh`);

    console.log('\n✅ VERIFICAÇÃO CONCLUÍDA\n');

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

verificar();
