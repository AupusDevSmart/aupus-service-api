const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDiagramas() {
  try {
    const diagramas = await prisma.diagramas_unitarios.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        nome: true,
        unidade_id: true
      },
      take: 10
    });

    console.log('📊 Diagramas encontrados:', diagramas.length);
    diagramas.forEach(d => {
      console.log('  -', d.id, '|', d.nome, '| unidade:', d.unidade_id);
    });

    // Verificar se a tabela tem as novas colunas
    const conexao = await prisma.equipamentos_conexoes.findFirst({
      select: {
        id: true,
        origem_tipo: true,
        origem_grid_x: true,
        destino_tipo: true
      }
    });
    console.log('\n✅ Colunas junction point existem!', conexao ? 'Exemplo:' : 'Sem conexões');
    if (conexao) console.log('   origem_tipo:', conexao.origem_tipo);

  } catch (error) {
    console.error('❌ Erro:', error.message);
    if (error.message.includes('column')) {
      console.log('\n⚠️  As colunas de junction point NÃO existem no banco!');
      console.log('   A migração precisa ser aplicada manualmente.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkDiagramas();
