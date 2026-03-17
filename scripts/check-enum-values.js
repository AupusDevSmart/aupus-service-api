const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkEnumValues() {
  console.log('🔍 Verificando valores dos enums no banco de dados...\n');

  try {
    // Check TipoSolicitacaoServico
    const tipoValues = await prisma.$queryRaw`
      SELECT
        t.typname AS enum_name,
        e.enumlabel AS enum_value
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'TipoSolicitacaoServico'
      ORDER BY e.enumsortorder;
    `;

    console.log('📊 Valores do enum TipoSolicitacaoServico no banco:');
    tipoValues.forEach(v => {
      console.log(`   - ${v.enum_value}`);
    });

    // Check OrigemSolicitacao
    const origemValues = await prisma.$queryRaw`
      SELECT
        t.typname AS enum_name,
        e.enumlabel AS enum_value
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'OrigemSolicitacao'
      ORDER BY e.enumsortorder;
    `;

    console.log('\n📊 Valores do enum OrigemSolicitacao no banco:');
    origemValues.forEach(v => {
      console.log(`   - ${v.enum_value}`);
    });

    // Teste com valor correto
    const planta = await prisma.plantas.findFirst();

    if (planta) {
      console.log('\n🧪 Tentando criar solicitação com valores do banco...');

      const testSolicitacao = await prisma.solicitacoes_servico.create({
        data: {
          numero: `TEST-${Date.now()}`,
          titulo: 'Solicitação de Teste',
          descricao: 'Teste de verificação da migração',
          tipo: 'TREINAMENTO', // Usando um valor que sabemos que existe
          prioridade: 'MEDIA',
          status: 'RASCUNHO',
          origem: 'PORTAL', // Usando valor correto
          planta_id: planta.id,
          local: 'Teste Local',
          justificativa: 'Teste de migração',
          solicitante_nome: 'Sistema de Migração',
        }
      });

      console.log(`✅ Solicitação criada: ${testSolicitacao.numero}`);

      // Limpar
      await prisma.solicitacoes_servico.delete({
        where: { id: testSolicitacao.id }
      });
      console.log('✅ Dados de teste removidos');
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkEnumValues();