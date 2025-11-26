const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verificarPivo() {
  try {
    console.log('🔍 Verificando tipo PIVO no banco de dados...\n');

    // Buscar tipo PIVO
    const tipoPivo = await prisma.tipos_equipamentos.findFirst({
      where: {
        codigo: 'PIVO'
      }
    });

    if (tipoPivo) {
      console.log('✅ Tipo PIVO encontrado!');
      console.log('═══════════════════════════════════════════════════');
      console.log('   ID:', tipoPivo.id);
      console.log('   Código:', tipoPivo.codigo);
      console.log('   Nome:', tipoPivo.nome);
      console.log('   Categoria:', tipoPivo.categoria);
      console.log('   Tamanho:', `${tipoPivo.largura_padrao}x${tipoPivo.altura_padrao}`);
      console.log('═══════════════════════════════════════════════════\n');

      // Verificar se há equipamentos deste tipo
      const equipamentosPivo = await prisma.equipamentos.count({
        where: {
          tipo_equipamento_id: tipoPivo.id
        }
      });

      console.log(`📊 Equipamentos do tipo PIVO cadastrados: ${equipamentosPivo}`);

      if (equipamentosPivo === 0) {
        console.log('\n💡 Dica: Você pode cadastrar equipamentos PIVO na interface:');
        console.log('   1. Acesse Configurações > Equipamentos');
        console.log('   2. Clique em "Novo Equipamento"');
        console.log('   3. Selecione o tipo "Pivô Central de Irrigação"');
        console.log('   4. Preencha os dados e salve');
      }
    } else {
      console.log('❌ Tipo PIVO não encontrado!');
      console.log('\n💡 Execute o script inserir-tipo-pivo.js para adicionar o tipo:');
      console.log('   node inserir-tipo-pivo.js');
    }

  } catch (error) {
    console.error('❌ Erro ao verificar tipo PIVO:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verificarPivo()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });