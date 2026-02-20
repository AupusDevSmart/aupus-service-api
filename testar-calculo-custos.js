const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testarCalculoCustos() {
  console.log('\n?? TESTANDO CÁLCULO DE CUSTOS\n');
  console.log('='.repeat(80));

  try {
    const equipamento = await prisma.equipamentos.findFirst({
      where: { nome: 'P666' },
      select: {
        id: true,
        nome: true,
        unidade: {
          select: {
            nome: true,
            grupo: true,
            subgrupo: true,
            concessionaria: { select: { nome: true } },
          },
        },
      },
    });

    if (!equipamento) {
      console.log('? Equipamento P666 não encontrado!');
      return;
    }

    console.log('?? EQUIPAMENTO:', equipamento.nome);
    console.log('?? UNIDADE:', equipamento.unidade.nome);
    console.log('?? GRUPO:', equipamento.unidade.grupo);

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const leiturasComEnergia = await prisma.equipamentos_dados.findMany({
      where: {
        equipamento_id: equipamento.id,
        timestamp_dados: { gte: hoje },
        energia_kwh: { gt: 0 },
      },
      orderBy: { timestamp_dados: 'desc' },
      take: 5,
    });

    console.log('\n?? LEITURAS COM ENERGIA > 0:', leiturasComEnergia.length);

    if (leiturasComEnergia.length === 0) {
      console.log('? Nenhuma leitura com energia > 0');
      return;
    }

    let somaEnergia = 0;
    leiturasComEnergia.forEach((l) => {
      const e = parseFloat(l.energia_kwh.toString());
      somaEnergia += e;
      console.log();
    });

    console.log();
    const custo = somaEnergia * 0.40;
    console.log();

  } catch (error) {
    console.error('? ERRO:', error.message);
  } finally {
    await prisma.();
  }
}

testarCalculoCustos();
