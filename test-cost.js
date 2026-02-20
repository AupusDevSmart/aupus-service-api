const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const eq = await prisma.equipamentos.findFirst({
      where: { nome: 'P666' },
      include: { unidade: { include: { concessionaria: true } } }
    });
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const leituras = await prisma.equipamentos_dados.findMany({
      where: {
        equipamento_id: eq.id,
        timestamp_dados: { gte: hoje },
        energia_kwh: { gt: 0 }
      },
      take: 5,
      orderBy: { timestamp_dados: 'desc' }
    });
    
    console.log('Leituras com energia:', leituras.length);
    let soma = 0;
    leituras.forEach(l => {
      const e = parseFloat(l.energia_kwh);
      soma += e;
      console.log(l.timestamp_dados.toISOString(), e.toFixed(4), 'kWh');
    });
    console.log('Total:', soma.toFixed(4), 'kWh');
    console.log('Custo estimado: R$', (soma * 0.40).toFixed(2));
  } finally {
    await prisma.$disconnect();
  }
}
test();