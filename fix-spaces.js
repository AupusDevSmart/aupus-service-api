const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['info', 'warn', 'error'],
});

async function fixSpaces() {
  try {
    console.log('=== CORRIGINDO ESPAÇOS NOS IDS ===\n');

    // 1. Corrigir espaços em unidades
    console.log('1. Corrigindo espaços em IDs de unidades...');
    const unidadesUpdate = await prisma.$executeRaw`
      UPDATE unidades
      SET id = TRIM(id)
      WHERE id != TRIM(id)
    `;
    console.log(`   - ${unidadesUpdate} unidades atualizadas`);

    // 2. Corrigir espaços em planta_id das unidades
    console.log('2. Corrigindo espaços em planta_id das unidades...');
    const unidadesPlantaUpdate = await prisma.$executeRaw`
      UPDATE unidades
      SET planta_id = TRIM(planta_id)
      WHERE planta_id IS NOT NULL AND planta_id != TRIM(planta_id)
    `;
    console.log(`   - ${unidadesPlantaUpdate} planta_id atualizados em unidades`);

    // 3. Corrigir espaços em plantas
    console.log('3. Corrigindo espaços em IDs de plantas...');
    const plantasUpdate = await prisma.$executeRaw`
      UPDATE plantas
      SET id = TRIM(id)
      WHERE id != TRIM(id)
    `;
    console.log(`   - ${plantasUpdate} plantas atualizadas`);

    // 4. Corrigir espaços em solicitacoes_servico
    console.log('4. Corrigindo espaços em solicitacoes_servico...');
    const solicitacoesUnidadeUpdate = await prisma.$executeRaw`
      UPDATE solicitacoes_servico
      SET unidade_id = TRIM(unidade_id)
      WHERE unidade_id IS NOT NULL AND unidade_id != TRIM(unidade_id)
    `;
    console.log(`   - ${solicitacoesUnidadeUpdate} unidade_id atualizados`);

    const solicitacoesPlantaUpdate = await prisma.$executeRaw`
      UPDATE solicitacoes_servico
      SET planta_id = TRIM(planta_id)
      WHERE planta_id IS NOT NULL AND planta_id != TRIM(planta_id)
    `;
    console.log(`   - ${solicitacoesPlantaUpdate} planta_id atualizados`);

    const solicitacoesProprietarioUpdate = await prisma.$executeRaw`
      UPDATE solicitacoes_servico
      SET proprietario_id = TRIM(proprietario_id)
      WHERE proprietario_id IS NOT NULL AND proprietario_id != TRIM(proprietario_id)
    `;
    console.log(`   - ${solicitacoesProprietarioUpdate} proprietario_id atualizados`);

    // 5. Verificar resultado
    console.log('\n=== VERIFICANDO RESULTADO ===');
    const targetUnidadeId = 'cmllg2hfw00cnjqctjstb6eyg';

    const unidade = await prisma.unidades.findUnique({
      where: { id: targetUnidadeId },
    });

    if (unidade) {
      console.log('✓ Unidade encontrada:', { id: unidade.id, nome: unidade.nome });
    } else {
      console.log('✗ Unidade não encontrada');
    }

    const solicitacao = await prisma.solicitacoes_servico.findFirst({
      where: { unidade_id: targetUnidadeId },
      include: {
        unidade: true,
        // Não incluir planta diretamente devido ao soft delete
      },
    });

    if (solicitacao) {
      console.log('✓ Solicitação encontrada:', solicitacao.numero);
      console.log('  - Unidade carregada?:', solicitacao.unidade ? 'SIM' : 'NÃO');
      if (solicitacao.unidade) {
        console.log('  - Nome da unidade:', solicitacao.unidade.nome);
      }
    } else {
      console.log('✗ Nenhuma solicitação encontrada com a unidade');
    }

    console.log('\n✅ CORREÇÃO CONCLUÍDA COM SUCESSO!');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixSpaces();