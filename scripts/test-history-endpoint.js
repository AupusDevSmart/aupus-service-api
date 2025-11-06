const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const equipamentoId = 'cmhcfyoj30003jqo8bhhaexlp';
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
  const limite = 288;

  console.log('🔍 Testando query do endpoint de histórico...');
  console.log('Período:', startDate.toISOString(), '-', endDate.toISOString());
  console.log('Limite:', limite);

  const dados = await prisma.equipamentos_dados.findMany({
    where: {
      equipamento_id: equipamentoId,
      timestamp_dados: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { timestamp_dados: 'asc' },
    take: limite,
  });

  console.log('\n📊 Total de registros retornados:', dados.length);

  if (dados.length > 0) {
    console.log('\n✅ Primeiros 3 registros:');
    dados.slice(0, 3).forEach((d, i) => {
      console.log(`${i + 1}. Timestamp: ${d.timestamp_dados.toISOString()}`);
      console.log(`   Power: ${d.dados?.power?.active_total || 'N/A'} W`);
      console.log('');
    });

    console.log('✅ Últimos 3 registros:');
    dados.slice(-3).forEach((d, i) => {
      console.log(`${i + 1}. Timestamp: ${d.timestamp_dados.toISOString()}`);
      console.log(`   Power: ${d.dados?.power?.active_total || 'N/A'} W`);
      console.log('');
    });

    // Simular formato de resposta da API
    const dadosFormatados = dados.map((dado) => ({
      id: dado.id,
      timestamp_dados: dado.timestamp_dados,
      dados: dado.dados,
      qualidade: dado.qualidade,
      fonte: dado.fonte,
      created_at: dado.created_at,
    }));

    const response = {
      data: dadosFormatados,
      pagination: {
        page: 1,
        limit: limite,
        total: dadosFormatados.length,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };

    console.log('\n📦 Formato da resposta API:');
    console.log('   Total de pontos:', response.data.length);
    console.log('   Pagination:', JSON.stringify(response.pagination, null, 2));
  } else {
    console.log('\n❌ Nenhum dado encontrado');
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
