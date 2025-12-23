const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function buscarTiposM160() {
  try {
    const tipos = await prisma.tipos_equipamentos.findMany({
      where: {
        OR: [
          { codigo: { contains: 'M160' } },
          { codigo: { contains: 'M-160' } },
          { codigo: { contains: 'MEDIDOR' } },
          { codigo: { contains: 'METER' } }
        ]
      }
    });

    console.log('='.repeat(80));
    console.log('TIPOS DE EQUIPAMENTO M160 ENCONTRADOS');
    console.log('='.repeat(80));
    console.log('');

    if (tipos.length === 0) {
      console.log('❌ Nenhum tipo M160 encontrado!');
      return;
    }

    tipos.forEach((tipo, index) => {
      console.log(`${index + 1}. Tipo: ${tipo.codigo}`);
      console.log(`   Nome: ${tipo.nome}`);
      console.log(`   ID: ${tipo.id}`);
      console.log(`   Categoria: ${tipo.categoria}`);
      console.log(`   Tem schema: ${tipo.propriedades_schema ? 'SIM' : 'NÃO'}`);

      if (tipo.propriedades_schema) {
        console.log('   Schema atual:');
        console.log(JSON.stringify(tipo.propriedades_schema, null, 2).split('\n').map(l => '     ' + l).join('\n'));
      }
      console.log('');
    });

    console.log('='.repeat(80));

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

buscarTiposM160();
