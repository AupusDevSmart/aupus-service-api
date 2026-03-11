const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDates() {
  console.log('\n📅 Verificando datas das anomalias ativas:\n');
  console.log('='.repeat(80));

  const anomalias = await prisma.anomalias.findMany({
    where: { deleted_at: null },
    select: {
      id: true,
      descricao: true,
      created_at: true,
      status: true
    },
    orderBy: { created_at: 'desc' }
  });

  const agora = new Date();
  let dentro30Dias = 0;
  let dentro1Ano = 0;
  let maisVelhas = 0;

  anomalias.forEach((a, i) => {
    const diasAtras = Math.floor((agora - new Date(a.created_at)) / (1000 * 60 * 60 * 24));
    const dataFormatada = new Date(a.created_at).toLocaleDateString('pt-BR');

    if (diasAtras <= 30) dentro30Dias++;
    if (diasAtras <= 365) dentro1Ano++;
    else maisVelhas++;

    console.log(`${i+1}. ${a.descricao.substring(0, 40).padEnd(40)} | ${dataFormatada} | Há ${diasAtras} dias | ${a.status}`);
  });

  console.log('\n' + '='.repeat(80));
  console.log(`\n📊 Resumo:`);
  console.log(`   Total de anomalias ativas: ${anomalias.length}`);
  console.log(`   Dentro dos últimos 30 dias: ${dentro30Dias}`);
  console.log(`   Dentro do último ano: ${dentro1Ano}`);
  console.log(`   Mais antigas que 1 ano: ${maisVelhas}`);
  console.log('\n');

  await prisma.$disconnect();
}

checkDates();
