const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Remove tipos M160 duplicados, mantendo apenas METER_M160
 */
async function limparTiposDuplicados() {
  try {
    console.log('='.repeat(80));
    console.log('LIMPANDO TIPOS M160 DUPLICADOS');
    console.log('='.repeat(80));
    console.log('');

    // Listar todos os tipos M160
    const todos = await prisma.tipos_equipamentos.findMany({
      where: {
        OR: [
          { codigo: { contains: 'M160' } },
          { codigo: { contains: 'M-160' } },
          { codigo: { contains: 'MEDIDOR' } },
          { codigo: { contains: 'METER' } }
        ]
      }
    });

    console.log(`Encontrados ${todos.length} tipos:\n`);
    todos.forEach((t, i) => {
      console.log(`${i + 1}. ${t.codigo} (${t.id}) - "${t.nome}"`);
    });
    console.log('');

    // Tipo que vamos MANTER (trim para remover espaços)
    const tipoMeter = todos.find(t => t.codigo === 'METER_M160');
    if (!tipoMeter) {
      console.error('❌ Tipo METER_M160 não encontrado!');
      return;
    }
    const MANTER = tipoMeter.id.trim(); // METER_M160

    // Tipos que vamos DELETAR (excluir também METER_LANDIS que não é M160)
    const parasRemover = todos.filter(t => t.id.trim() !== MANTER && t.codigo !== 'METER_LANDIS');

    if (parasRemover.length === 0) {
      console.log('✅ Não há tipos duplicados para remover!');
      return;
    }

    console.log(`⚠️ Tipos que serão REMOVIDOS (${parasRemover.length}):\n`);
    parasRemover.forEach(t => {
      console.log(`   ❌ ${t.codigo} (${t.id})`);
    });
    console.log('');

    console.log(`✅ Tipo que será MANTIDO:\n`);
    console.log(`   ✅ ${tipoMeter.codigo} (${tipoMeter.id.trim()}) - "${tipoMeter.nome}"`);
    console.log('');

    // Verificar se há equipamentos usando os tipos a serem removidos
    for (const tipo of parasRemover) {
      const count = await prisma.equipamentos.count({
        where: { tipo_equipamento_id: tipo.id }
      });

      if (count > 0) {
        console.log(`⚠️ ATENÇÃO: Tipo "${tipo.codigo}" tem ${count} equipamento(s) associado(s)!`);
        console.log(`   → Vou atualizar esses equipamentos para usar METER_M160\n`);

        // Atualizar equipamentos para usar METER_M160
        await prisma.equipamentos.updateMany({
          where: { tipo_equipamento_id: tipo.id },
          data: { tipo_equipamento_id: MANTER }
        });

        console.log(`   ✅ ${count} equipamento(s) atualizado(s)\n`);
      }
    }

    // Agora deletar os tipos duplicados
    console.log('🗑️ Deletando tipos duplicados...\n');

    for (const tipo of parasRemover) {
      await prisma.tipos_equipamentos.delete({
        where: { id: tipo.id }
      });
      console.log(`   ✅ Deletado: ${tipo.codigo} (${tipo.id})`);
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('✅ LIMPEZA CONCLUÍDA!');
    console.log('='.repeat(80));
    console.log('');
    console.log(`✅ Tipo restante: METER_M160 (${MANTER})`);
    console.log('✅ Todos os equipamentos M160 agora usam este tipo único');
    console.log('');

  } catch (error) {
    console.error('❌ Erro:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

limparTiposDuplicados();
