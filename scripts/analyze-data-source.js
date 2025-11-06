const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const equipamentoId = 'cmhcfyoj30003jqo8bhhaexlp'; // Inversor 1

  // Analisar dados por fonte
  const porFonte = await prisma.$queryRaw`
    SELECT
      fonte,
      COUNT(*) as total,
      MIN(timestamp_dados) as mais_antigo,
      MAX(timestamp_dados) as mais_recente
    FROM equipamentos_dados
    WHERE equipamento_id = ${equipamentoId}
    GROUP BY fonte
  `;

  console.log('📊 Análise de dados por fonte:\n');
  porFonte.forEach(f => {
    console.log(`Fonte: ${f.fonte}`);
    console.log(`  Total: ${f.total}`);
    console.log(`  Mais antigo: ${f.mais_antigo}`);
    console.log(`  Mais recente: ${f.mais_recente}`);
    console.log('');
  });

  // Verificar dados com timestamp de 1970
  const dados1970 = await prisma.equipamentos_dados.findMany({
    where: {
      equipamento_id: equipamentoId,
      timestamp_dados: {
        lt: new Date('2000-01-01'),
      },
    },
    take: 3,
  });

  console.log('\n📅 Exemplos de dados com timestamp de 1970:');
  dados1970.forEach((d, i) => {
    console.log(`\n${i + 1}. ID: ${d.id}`);
    console.log(`   Fonte: ${d.fonte}`);
    console.log(`   Timestamp: ${d.timestamp_dados}`);
    console.log(`   Created at: ${d.created_at}`);
    console.log(`   Dados.timestamp: ${d.dados?.timestamp || 'N/A'}`);
    console.log(`   Power: ${d.dados?.power?.active_total || 'N/A'}`);
  });

  // Verificar dados MQTT recentes
  const dadosMqtt = await prisma.equipamentos_dados.findMany({
    where: {
      equipamento_id: equipamentoId,
      fonte: 'MQTT',
    },
    orderBy: { created_at: 'desc' },
    take: 3,
  });

  console.log('\n\n📡 Dados MQTT mais recentes:');
  dadosMqtt.forEach((d, i) => {
    console.log(`\n${i + 1}. ID: ${d.id}`);
    console.log(`   Timestamp dos dados: ${d.timestamp_dados}`);
    console.log(`   Created at: ${d.created_at}`);
    console.log(`   Dados.timestamp: ${d.dados?.timestamp || 'N/A'}`);
    console.log(`   Power: ${d.dados?.power?.active_total || 'N/A'}`);
  });
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
