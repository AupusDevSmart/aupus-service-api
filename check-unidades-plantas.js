const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkUnidadesPlantas() {
  try {
    // Buscar todas as unidades
    const unidades = await prisma.unidades.findMany({
      where: {
        deleted_at: null
      },
      select: {
        id: true,
        nome: true,
        planta_id: true,
        planta: {
          select: {
            id: true,
            nome: true,
            deleted_at: true,
            proprietario_id: true,
          }
        }
      },
      orderBy: {
        nome: 'asc'
      }
    });

    console.log('\n=== UNIDADES E SUAS PLANTAS ===\n');
    console.log(`Total de unidades: ${unidades.length}\n`);

    const unidadesComPlanta = [];
    const unidadesSemPlanta = [];
    const unidadesComPlantaDeletada = [];

    unidades.forEach((unidade, index) => {
      console.log(`${index + 1}. ${unidade.nome}`);
      console.log(`   Unidade ID: ${unidade.id}`);
      console.log(`   Planta ID: ${unidade.planta_id || 'NULL'}`);

      if (!unidade.planta_id) {
        console.log(`   ⚠️ SEM PLANTA!`);
        unidadesSemPlanta.push(unidade);
      } else if (!unidade.planta) {
        console.log(`   ⚠️ PLANTA NÃO ENCONTRADA!`);
        unidadesSemPlanta.push(unidade);
      } else if (unidade.planta.deleted_at) {
        console.log(`   ⚠️ PLANTA DELETADA: ${unidade.planta.nome}`);
        unidadesComPlantaDeletada.push(unidade);
      } else {
        console.log(`   ✓ Planta: ${unidade.planta.nome}`);
        console.log(`   Proprietário ID: ${unidade.planta.proprietario_id || 'NULL'}`);
        unidadesComPlanta.push(unidade);
      }
      console.log('');
    });

    console.log('\n=== RESUMO ===');
    console.log(`Unidades com planta válida: ${unidadesComPlanta.length}`);
    console.log(`Unidades SEM planta: ${unidadesSemPlanta.length}`);
    console.log(`Unidades com planta DELETADA: ${unidadesComPlantaDeletada.length}`);

    if (unidadesSemPlanta.length > 0) {
      console.log('\n⚠️ Unidades SEM planta:');
      unidadesSemPlanta.forEach(u => console.log(`  - ${u.nome} (${u.id})`));
    }

    if (unidadesComPlantaDeletada.length > 0) {
      console.log('\n⚠️ Unidades com planta DELETADA:');
      unidadesComPlantaDeletada.forEach(u => {
        console.log(`  - ${u.nome} (planta: ${u.planta?.nome || 'N/A'})`);
      });
    }

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUnidadesPlantas();
