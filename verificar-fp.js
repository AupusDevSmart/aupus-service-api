const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verificarFP() {
  try {
    const eq = await prisma.equipamentos.findFirst({ where: { nome: 'P666' } });

    const dados = await prisma.equipamentos_dados.findMany({
      where: { equipamento_id: eq.id },
      orderBy: { timestamp_dados: 'desc' },
      take: 10,
      select: { timestamp_dados: true, dados: true }
    });

    console.log('\n📊 VERIFICANDO FATOR DE POTÊNCIA (FP):\n');

    dados.forEach((d, i) => {
      const temDados = d.dados.Dados !== undefined;

      let fpa, fpb, fpc, pt;

      if (temDados) {
        // Formato legado
        fpa = d.dados.Dados.FPA;
        fpb = d.dados.Dados.FPB;
        fpc = d.dados.Dados.FPC;
        pt = d.dados.Dados.Pt;
      } else {
        // Formato novo
        fpa = d.dados.FPa;
        fpb = d.dados.FPb;
        fpc = d.dados.FPc;
        pt = d.dados.Pt;
      }

      console.log(`Leitura ${i+1} - ${d.timestamp_dados.toLocaleString('pt-BR')}`);
      console.log(`  Formato: ${temDados ? 'LEGADO' : 'NOVO'}`);
      console.log(`  Pt: ${pt} W`);
      console.log(`  FPa: ${fpa} → Abs: ${Math.abs(fpa || 0)}`);
      console.log(`  FPb: ${fpb} → Abs: ${Math.abs(fpb || 0)}`);
      console.log(`  FPc: ${fpc} → Abs: ${Math.abs(fpc || 0)}`);

      // Verificar se valores negativos podem estar sendo tratados como zero
      if (fpa && fpa !== 0) {
        console.log(`  ✅ FPa TEM VALOR: ${fpa}`);
      } else {
        console.log(`  ❌ FPa É ZERO OU UNDEFINED`);
      }
      console.log('');
    });

  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

verificarFP();
