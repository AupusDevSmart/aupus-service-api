const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const eq = await prisma.equipamentos.findFirst({ where: { nome: 'P666' } });
  const hoje = new Date('2026-02-20T00:00:00Z');
  
  const leituras = await prisma.equipamentos_dados.findMany({
    where: {
      equipamento_id: eq.id,
      timestamp_dados: { gte: hoje }
    },
    select: {
      timestamp_dados: true,
      energia_kwh: true
    },
    orderBy: { timestamp_dados: 'asc' }
  });
  
  const porHora = {};
  
  leituras.forEach(l => {
    const hora = l.timestamp_dados.getUTCHours();
    if (!porHora[hora]) {
      porHora[hora] = { total: 0, comEnergia: 0, soma: 0 };
    }
    porHora[hora].total++;
    const e = l.energia_kwh ? parseFloat(l.energia_kwh) : 0;
    if (e > 0) {
      porHora[hora].comEnergia++;
      porHora[hora].soma += e;
    }
  });
  
  console.log('HORA (UTC) | TOTAL | COM ENERGIA | SOMA');
  for (let h = 0; h < 24; h++) {
    if (porHora[h]) {
      const { total, comEnergia, soma } = porHora[h];
      console.log(h + 'h | ' + total + ' | ' + comEnergia + ' | ' + soma.toFixed(4) + ' kWh');
    }
  }
  
  process.exit(0);
}

main();
