const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verificarGeracao() {
  try {
    console.log('\n=== VERIFICANDO GERAÇÃO SOLAR ===\n');

    // Buscar último dado de inversor
    const ultimoDado = await prisma.equipamentos_dados.findFirst({
      where: {
        equipamento: {
          tipo_equipamento: 'INVERSOR_SOLAR'
        }
      },
      orderBy: {
        timestamp_dados: 'desc'
      },
      include: {
        equipamento: {
          select: {
            nome: true,
            tipo_equipamento: true
          }
        }
      }
    });

    if (!ultimoDado) {
      console.log('❌ Nenhum dado de inversor encontrado!');
      return;
    }

    console.log('✅ Último dado de inversor encontrado:');
    console.log(`   Equipamento: ${ultimoDado.equipamento.nome}`);
    console.log(`   Tipo: ${ultimoDado.equipamento.tipo_equipamento}`);
    console.log(`   Timestamp: ${ultimoDado.timestamp_dados}`);
    console.log(`   Potência (coluna): ${ultimoDado.potencia_ativa_kw} kW`);

    // Extrair potência do JSON se existir
    if (ultimoDado.dados) {
      const dados = ultimoDado.dados;
      if (dados.power?.active_total) {
        const potenciaJson = Number(dados.power.active_total) / 1000;
        console.log(`   Potência (JSON): ${potenciaJson} kW`);
      }
    }

    // Contar inversores ativos
    console.log('\n=== INVERSORES CADASTRADOS ===\n');
    const inversores = await prisma.equipamentos.findMany({
      where: {
        tipo_equipamento: 'INVERSOR_SOLAR',
        deleted_at: null
      },
      select: {
        nome: true,
        planta_id: true
      }
    });

    console.log(`Total de inversores: ${inversores.length}`);

    // Agrupar por planta
    const porPlanta = {};
    inversores.forEach(inv => {
      const plantaId = inv.planta_id || 'Sem planta';
      if (!porPlanta[plantaId]) {
        porPlanta[plantaId] = [];
      }
      porPlanta[plantaId].push(inv.nome);
    });

    console.log('\nInversores por planta:');
    for (const [plantaId, invs] of Object.entries(porPlanta)) {
      console.log(`  Planta ${plantaId}: ${invs.length} inversor(es)`);
      invs.forEach(nome => console.log(`    - ${nome}`));
    }

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verificarGeracao();
