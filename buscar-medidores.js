const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function buscarMedidores() {
  try {
    // Buscar tipos nas categorias Power Meter e Medidor SSU
    const tipos = await prisma.tipos_equipamentos.findMany({
      where: {
        OR: [
          { categoria_id: '9956da3a54a240398df9a75e06' }, // Power Meter (PM)
          { categoria_id: 'e042b107f3a744e6b9be75e93a' }  // Medidor SSU
        ]
      },
      include: {
        categoria: true
      }
    });

    console.log('\n========================================');
    console.log('TIPOS DE MEDIDORES CADASTRADOS');
    console.log('========================================\n');

    if (tipos.length === 0) {
      console.log('Nenhum tipo de medidor encontrado nestas categorias.\n');
    } else {
      tipos.forEach((tipo, index) => {
        console.log(`${index + 1}. TIPO: ${tipo.codigo}`);
        console.log(`   Nome: ${tipo.nome}`);
        console.log(`   Categoria: ${tipo.categoria.nome}`);
        console.log(`   Fabricante: ${tipo.fabricante}`);
        console.log(`   ID: ${tipo.id}`);
        console.log(`   Tem MQTT Schema: ${tipo.mqtt_schema ? 'SIM' : 'NÃO'}`);
        console.log('');
      });
    }

    // Buscar também por código M-160
    console.log('========================================');
    console.log('BUSCA POR CÓDIGO M-160/M160/METER');
    console.log('========================================\n');

    const tiposM160 = await prisma.tipos_equipamentos.findMany({
      where: {
        OR: [
          { codigo: { contains: 'M160' } },
          { codigo: { contains: 'M-160' } },
          { codigo: { contains: 'METER' } }
        ]
      },
      include: {
        categoria: true
      }
    });

    if (tiposM160.length === 0) {
      console.log('Nenhum tipo com código M160/M-160/METER encontrado.\n');
    } else {
      tiposM160.forEach((tipo, index) => {
        console.log(`${index + 1}. CÓDIGO: ${tipo.codigo}`);
        console.log(`   Nome: ${tipo.nome}`);
        console.log(`   Categoria: ${tipo.categoria.nome}`);
        console.log(`   Fabricante: ${tipo.fabricante}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('Erro ao buscar medidores:', error);
  } finally {
    await prisma.$disconnect();
  }
}

buscarMedidores();