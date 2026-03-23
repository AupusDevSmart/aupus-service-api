const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['info', 'warn', 'error'],
});

async function fixUnidadeId() {
  try {
    console.log('=== CORRIGINDO ID DA UNIDADE COM ESPAÇO ===\n');

    const oldId = 'cmllg2hfw00cnjqctjstb6eyg '; // com espaço
    const newId = 'cmllg2hfw00cnjqctjstb6eyg';  // sem espaço

    // 1. Verificar se já existe uma unidade com o ID sem espaço
    const existingUnidade = await prisma.unidades.findUnique({
      where: { id: newId },
    });

    if (existingUnidade) {
      console.log('⚠️  Já existe uma unidade com o ID sem espaço. Abortando para evitar conflito.');
      return;
    }

    // 2. Atualizar o ID da unidade
    console.log('1. Atualizando ID da unidade...');
    const unidadeUpdate = await prisma.$executeRaw`
      UPDATE unidades
      SET id = ${newId}
      WHERE id = ${oldId}
    `;
    console.log(`   - ${unidadeUpdate} unidade(s) atualizada(s)`);

    // 3. Atualizar referencias em solicitacoes_servico
    console.log('2. Atualizando referências em solicitacoes_servico...');
    const solicitacoesUpdate = await prisma.$executeRaw`
      UPDATE solicitacoes_servico
      SET unidade_id = ${newId}
      WHERE unidade_id = ${oldId}
    `;
    console.log(`   - ${solicitacoesUpdate} solicitação(ões) atualizada(s)`);

    // 4. Atualizar referencias em equipamentos
    console.log('3. Atualizando referências em equipamentos...');
    const equipamentosUpdate = await prisma.$executeRaw`
      UPDATE equipamentos
      SET unidade_id = ${newId}
      WHERE unidade_id = ${oldId}
    `;
    console.log(`   - ${equipamentosUpdate} equipamento(s) atualizado(s)`);

    // 5. Verificar resultado
    console.log('\n=== VERIFICANDO RESULTADO ===');

    const unidade = await prisma.unidades.findUnique({
      where: { id: newId },
    });

    if (unidade) {
      console.log('✓ Unidade encontrada com ID correto:', { id: unidade.id, nome: unidade.nome });
    }

    const solicitacao = await prisma.solicitacoes_servico.findFirst({
      where: { unidade_id: newId },
      include: {
        unidade: true,
      },
    });

    if (solicitacao) {
      console.log('✓ Solicitação encontrada:', solicitacao.numero);
      console.log('  - Unidade carregada?:', solicitacao.unidade ? 'SIM' : 'NÃO');
      if (solicitacao.unidade) {
        console.log('  - Nome da unidade:', solicitacao.unidade.nome);
      }
    }

    console.log('\n✅ CORREÇÃO DO ID DA UNIDADE CONCLUÍDA COM SUCESSO!');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixUnidadeId();