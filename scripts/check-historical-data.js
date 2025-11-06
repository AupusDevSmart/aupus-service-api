const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const equipamentoId = 'cmhcfyoj30003jqo8bhhaexlp'; // Inversor 1

  // Contar total de dados
  const total = await prisma.equipamentos_dados.count({
    where: { equipamento_id: equipamentoId },
  });

  console.log(`Total de registros para equipamento ${equipamentoId}: ${total}`);

  // Buscar últimos 5 dados
  const ultimos = await prisma.equipamentos_dados.findMany({
    where: { equipamento_id: equipamentoId },
    orderBy: { timestamp_dados: 'desc' },
    take: 5,
  });

  console.log('\nÚltimos 5 registros:');
  ultimos.forEach((d, i) => {
    console.log(`${i + 1}. Timestamp: ${d.timestamp_dados}, Power: ${d.dados?.power?.active_total || 'N/A'}`);
  });

  // Buscar dados das últimas 24h
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

  const dadosUltimas24h = await prisma.equipamentos_dados.findMany({
    where: {
      equipamento_id: equipamentoId,
      timestamp_dados: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { timestamp_dados: 'desc' },
  });

  console.log(`\nDados das últimas 24h (${startDate.toISOString()} - ${endDate.toISOString()}): ${dadosUltimas24h.length}`);

  if (dadosUltimas24h.length > 0) {
    console.log('Primeiro:', dadosUltimas24h[dadosUltimas24h.length - 1].timestamp_dados);
    console.log('Último:', dadosUltimas24h[0].timestamp_dados);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
