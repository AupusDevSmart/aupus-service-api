const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkUnidades() {
  try {
    const unidades = await prisma.unidades.findMany({
      select: {
        id: true,
        nome: true,
        latitude: true,
        longitude: true,
        cidade: true,
        estado: true,
      },
      orderBy: {
        nome: 'asc'
      }
    });

    console.log('\n=== UNIDADES NO BANCO ===\n');
    console.log(`Total de unidades: ${unidades.length}\n`);

    unidades.forEach((unidade, index) => {
      const temCoords = unidade.latitude && unidade.longitude;
      console.log(`${index + 1}. ${unidade.nome}`);
      console.log(`   ID: ${unidade.id}`);
      console.log(`   Localização: ${unidade.cidade || 'N/A'}, ${unidade.estado || 'N/A'}`);
      console.log(`   Coordenadas: ${temCoords ? `${unidade.latitude}, ${unidade.longitude}` : 'NÃO POSSUI'}`);
      console.log('');
    });

    const unidadesComCoords = unidades.filter(u => u.latitude && u.longitude);
    const unidadesSemCoords = unidades.filter(u => !u.latitude || !u.longitude);

    console.log('\n=== RESUMO ===');
    console.log(`Unidades COM coordenadas: ${unidadesComCoords.length}`);
    console.log(`Unidades SEM coordenadas: ${unidadesSemCoords.length}`);

    if (unidadesSemCoords.length > 0) {
      console.log('\nUnidades SEM coordenadas:');
      unidadesSemCoords.forEach(u => console.log(`  - ${u.nome}`));
    }

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUnidades();
