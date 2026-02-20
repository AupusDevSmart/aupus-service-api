const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testarAgregacao() {
  try {
    const eq = await prisma.equipamentos.findFirst({ where: { nome: 'P666' } });

    const dados = await prisma.equipamentos_dados.findMany({
      where: { equipamento_id: eq.id },
      orderBy: { timestamp_dados: 'desc' },
      take: 3,
      select: { timestamp_dados: true, dados: true }
    });

    console.log('\n📊 TESTE DE AGREGAÇÃO M-160:\n');

    dados.forEach((d, i) => {
      console.log(`--- Leitura ${i+1} ---`);

      const temDados = d.dados.Dados !== undefined;
      const temVa = d.dados.Va !== undefined;
      const temIa = d.dados.Ia !== undefined;

      console.log('  d.dados.Dados?', temDados);
      console.log('  d.dados.Va?', temVa, '→', d.dados.Va);
      console.log('  d.dados.Ia?', temIa, '→', d.dados.Ia);
      console.log('  d.dados.FPa?', d.dados.FPa !== undefined, '→', d.dados.FPa);
      console.log('  d.dados.phf?', d.dados.phf !== undefined, '→', d.dados.phf);

      if (d.dados.Dados) {
        console.log('  🔵 FORMATO: LEGADO');
      } else if (d.dados.Va !== undefined || d.dados.Ia !== undefined) {
        console.log('  🟢 FORMATO: NOVO (será agregado)');
        console.log('     Valores que seriam agregados:');
        console.log('     - FPa:', d.dados.FPa);
        console.log('     - phf:', d.dados.phf);
      } else {
        console.log('  🔴 FORMATO: NÃO RECONHECIDO (não será agregado)');
      }
      console.log('');
    });
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

testarAgregacao();
