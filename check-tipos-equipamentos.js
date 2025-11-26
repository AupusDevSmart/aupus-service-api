const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTiposEquipamentos() {
  try {
    console.log('🔍 Verificando tipos de equipamentos cadastrados...\n');

    const tipos = await prisma.tipos_equipamentos.findMany({
      orderBy: {
        categoria: 'asc'
      }
    });

    console.log(`📊 Total de tipos cadastrados: ${tipos.length}\n`);

    if (tipos.length > 0) {
      console.log('Lista de tipos de equipamentos:');
      console.log('================================');

      // Agrupar por categoria
      const categorias = {};
      tipos.forEach(tipo => {
        if (!categorias[tipo.categoria]) {
          categorias[tipo.categoria] = [];
        }
        categorias[tipo.categoria].push(tipo);
      });

      // Exibir por categoria
      Object.keys(categorias).sort().forEach(categoria => {
        console.log(`\n📁 Categoria: ${categoria}`);
        console.log('   ' + '-'.repeat(40));

        categorias[categoria].forEach(tipo => {
          console.log(`   • ${tipo.nome} (${tipo.codigo})`);
          console.log(`     - ID: ${tipo.id}`);
          console.log(`     - Tamanho padrão: ${tipo.largura_padrao}x${tipo.altura_padrao}`);
          if (tipo.icone_svg) {
            console.log(`     - Possui ícone SVG personalizado`);
          }
          if (tipo.propriedades_schema) {
            console.log(`     - Possui schema de propriedades`);
          }
        });
      });
    }

    // Verificar equipamentos usando cada tipo
    console.log('\n\n📊 Uso dos tipos de equipamentos:');
    console.log('===================================');

    for (const tipo of tipos) {
      const count = await prisma.equipamentos.count({
        where: {
          tipo_equipamento_id: tipo.id
        }
      });

      if (count > 0) {
        console.log(`   ${tipo.nome}: ${count} equipamento(s)`);
      }
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTiposEquipamentos()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });