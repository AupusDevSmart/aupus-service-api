const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function addOrigemOSValue() {
  console.log('🚀 Adicionando SOLICITACAO_SERVICO ao enum OrigemOS...\n');

  try {
    // Verificar valores atuais do enum
    console.log('📌 Verificando valores atuais do enum OrigemOS...');

    const currentValues = await prisma.$queryRaw`
      SELECT enumlabel
      FROM pg_enum
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OrigemOS')
      ORDER BY enumsortorder;
    `;

    console.log('Valores atuais:');
    currentValues.forEach(v => console.log(`   - ${v.enumlabel}`));

    // Verificar se SOLICITACAO_SERVICO já existe
    const hasValue = currentValues.some(v => v.enumlabel === 'SOLICITACAO_SERVICO');

    if (hasValue) {
      console.log('\n✅ SOLICITACAO_SERVICO já existe no enum OrigemOS!');
      return;
    }

    // Adicionar o novo valor
    console.log('\n📌 Adicionando SOLICITACAO_SERVICO...');

    try {
      await prisma.$executeRawUnsafe(`
        ALTER TYPE "OrigemOS" ADD VALUE 'SOLICITACAO_SERVICO'
      `);
      console.log('   ✅ Valor adicionado com sucesso!');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('   ⚠️ Valor já existe no enum');
      } else {
        throw error;
      }
    }

    // Verificar novamente
    const finalValues = await prisma.$queryRaw`
      SELECT enumlabel
      FROM pg_enum
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OrigemOS')
      ORDER BY enumsortorder;
    `;

    console.log('\n✨ Valores finais do enum OrigemOS:');
    finalValues.forEach(v => {
      const mark = v.enumlabel === 'SOLICITACAO_SERVICO' ? '✅' : '○';
      console.log(`   ${mark} ${v.enumlabel}`);
    });

    console.log('\n🎉 Enum OrigemOS atualizado com sucesso!');

  } catch (error) {
    console.error('❌ Erro ao adicionar valor ao enum:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addOrigemOSValue();