const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const equipamentos = [
    { id: 'cmhcfyoj30003jqo8bhhaexlp', nome: 'Inversor 1' },
    { id: 'cmhdd6wkv001kjqo8rl39taa6', nome: 'Inversor 2' },
    { id: 'cmhddtv0h0024jqo8h4dzm4gq', nome: 'Inversor 3' },
  ];

  console.log('🔍 Analisando dados de potência dos inversores...\n');

  for (const equipamento of equipamentos) {
    console.log(`\n📊 ${equipamento.nome} (${equipamento.id})`);
    console.log('='.repeat(80));

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

    // Contar total de registros
    const totalRecords = await prisma.equipamentos_dados.count({
      where: { equipamento_id: equipamento.id },
    });

    // Contar registros nas últimas 24h
    const recentRecords = await prisma.equipamentos_dados.count({
      where: {
        equipamento_id: equipamento.id,
        timestamp_dados: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    console.log(`Total de registros: ${totalRecords}`);
    console.log(`Registros nas últimas 24h: ${recentRecords}`);

    // Buscar últimos 10 registros
    const lastRecords = await prisma.equipamentos_dados.findMany({
      where: { equipamento_id: equipamento.id },
      orderBy: { created_at: 'desc' },
      take: 10,
    });

    console.log('\n✅ Últimos 10 registros (ordenados por created_at):');
    lastRecords.forEach((record, i) => {
      const power = record.dados?.power?.active_total;
      const powerKW = power ? (power / 1000).toFixed(2) : 'N/A';
      console.log(
        `${i + 1}. Timestamp dados: ${record.timestamp_dados.toISOString()} | ` +
          `Created: ${record.created_at.toISOString()} | ` +
          `Power: ${powerKW} kW`
      );
    });

    // Buscar registros com power > 0 nas últimas 24h
    const powerRecords = await prisma.equipamentos_dados.findMany({
      where: {
        equipamento_id: equipamento.id,
        timestamp_dados: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { timestamp_dados: 'asc' },
    });

    const validPowerRecords = powerRecords.filter(
      (r) => r.dados?.power?.active_total && r.dados.power.active_total > 0
    );

    console.log(`\n⚡ Registros com potência > 0 nas últimas 24h: ${validPowerRecords.length}`);
    if (validPowerRecords.length > 0) {
      console.log('\nPrimeiros 5 registros com potência > 0:');
      validPowerRecords.slice(0, 5).forEach((record, i) => {
        const power = record.dados.power.active_total;
        const powerKW = (power / 1000).toFixed(2);
        console.log(
          `${i + 1}. ${record.timestamp_dados.toISOString()} | Power: ${powerKW} kW`
        );
      });

      console.log('\nÚltimos 5 registros com potência > 0:');
      validPowerRecords.slice(-5).forEach((record, i) => {
        const power = record.dados.power.active_total;
        const powerKW = (power / 1000).toFixed(2);
        console.log(
          `${i + 1}. ${record.timestamp_dados.toISOString()} | Power: ${powerKW} kW`
        );
      });
    }
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
