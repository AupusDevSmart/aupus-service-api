const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function checkAndFixSpaces() {
  try {
    const targetUnidadeId = 'cmllg2hfw00cnjqctjstb6eyg';

    console.log('=== Verificando unidade ===');
    const unidade = await prisma.unidades.findUnique({
      where: { id: targetUnidadeId },
    });

    if (unidade) {
      console.log('Unidade encontrada:', { id: unidade.id, nome: unidade.nome });
    } else {
      console.log('Unidade NÃO encontrada com ID:', targetUnidadeId);
    }

    console.log('\n=== Verificando solicitações com espaços ===');
    const solicitacoesComEspacos = await prisma.$queryRaw`
      SELECT
        id,
        numero,
        unidade_id,
        LENGTH(unidade_id) as id_length,
        LENGTH(TRIM(unidade_id)) as trimmed_length,
        CASE WHEN unidade_id != TRIM(unidade_id) THEN 'TEM_ESPACOS' ELSE 'OK' END as status
      FROM solicitacoes_servico
      WHERE unidade_id IS NOT NULL
        AND (unidade_id = ${targetUnidadeId} OR TRIM(unidade_id) = ${targetUnidadeId})
      LIMIT 10
    `;

    console.log('Solicitações encontradas:', solicitacoesComEspacos);

    console.log('\n=== Corrigindo espaços em unidade_id ===');
    const updateResult = await prisma.$executeRaw`
      UPDATE solicitacoes_servico
      SET unidade_id = TRIM(unidade_id)
      WHERE unidade_id IS NOT NULL
        AND unidade_id != TRIM(unidade_id)
    `;

    console.log(`${updateResult} registros atualizados`);

    console.log('\n=== Verificando após correção ===');
    const solicitacaoAposCorrecao = await prisma.solicitacoes_servico.findFirst({
      where: {
        unidade_id: targetUnidadeId
      },
      include: {
        unidade: true,
        planta: true,
        proprietario: true,
      },
    });

    if (solicitacaoAposCorrecao) {
      console.log('Solicitação após correção:');
      console.log('- Número:', solicitacaoAposCorrecao.numero);
      console.log('- Unidade ID:', solicitacaoAposCorrecao.unidade_id);
      console.log('- Unidade carregada?:', solicitacaoAposCorrecao.unidade ? 'SIM' : 'NÃO');
      if (solicitacaoAposCorrecao.unidade) {
        console.log('- Nome da unidade:', solicitacaoAposCorrecao.unidade.nome);
      }
    } else {
      console.log('Nenhuma solicitação encontrada com unidade_id:', targetUnidadeId);
    }

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAndFixSpaces();