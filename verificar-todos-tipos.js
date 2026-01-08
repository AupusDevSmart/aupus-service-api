const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Verificando todos os tipos de equipamentos...\n');

  try {
    const tipos = await prisma.tipos_equipamentos.findMany({
      select: {
        id: true,
        codigo: true,
        nome: true,
        propriedades_schema: true,
        categoria: {
          select: {
            nome: true
          }
        }
      },
      orderBy: {
        nome: 'asc'
      }
    });

    console.log(`📊 Total de tipos encontrados: ${tipos.length}\n`);
    console.log('=' .repeat(100));

    tipos.forEach((tipo, index) => {
      console.log(`\n${index + 1}. ${tipo.nome} (${tipo.codigo})`);
      console.log(`   Categoria: ${tipo.categoria?.nome || 'Sem categoria'}`);

      if (tipo.propriedades_schema && tipo.propriedades_schema.campos) {
        console.log(`   Campos técnicos: ${tipo.propriedades_schema.campos.length}`);
        tipo.propriedades_schema.campos.forEach((campo, i) => {
          const obr = campo.obrigatorio ? '⚠️ ' : '  ';
          const unid = campo.unidade ? ` [${campo.unidade}]` : '';
          const tipo_campo = campo.tipo;
          const opcoes = campo.opcoes ? ` (opções: ${campo.opcoes.join(', ')})` : '';
          console.log(`   ${obr}${i + 1}. ${campo.campo}${unid} (${tipo_campo})${opcoes}`);
        });
      } else {
        console.log('   ⚠️  SEM CAMPOS TÉCNICOS DEFINIDOS');
      }
      console.log('-'.repeat(100));
    });

    console.log('\n✅ Verificação concluída!');
  } catch (error) {
    console.error('\n❌ Erro:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
