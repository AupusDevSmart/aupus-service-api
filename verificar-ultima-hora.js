const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verificarRecentes() {
  try {
    const eq = await prisma.equipamentos.findFirst({ where: { nome: 'P666' } });

    const agora = new Date();
    const umaHoraAtras = new Date(agora);
    umaHoraAtras.setHours(umaHoraAtras.getHours() - 1);

    const dados = await prisma.equipamentos_dados.findMany({
      where: {
        equipamento_id: eq.id,
        timestamp_dados: {
          gte: umaHoraAtras,
          lt: agora,
        }
      },
      orderBy: { timestamp_dados: 'desc' },
      take: 10,
      select: { timestamp_dados: true, dados: true }
    });

    console.log(`\n📊 DADOS DA ÚLTIMA HORA: ${dados.length} registros\n`);

    dados.forEach((d, i) => {
      console.log(`Registro ${i+1} - ${d.timestamp_dados.toLocaleString('pt-BR')}`);
      console.log(`  Formato legado? ${d.dados.Dados !== undefined}`);
      console.log(`  FPa: ${d.dados.FPa || d.dados.Dados?.FPa || 'undefined'}`);
      console.log(`  phf: ${d.dados.phf || d.dados.Dados?.phf || 'undefined'}`);
      console.log('');
    });

  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

verificarRecentes();
