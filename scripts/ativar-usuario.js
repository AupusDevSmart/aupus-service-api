// Script para ativar um usuário específico
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function ativarUsuario() {
  const email = process.argv[2];

  if (!email) {
    console.log('❌ Uso: node scripts/ativar-usuario.js <email>');
    console.log('   Exemplo: node scripts/ativar-usuario.js teste@aupus.com');
    process.exit(1);
  }

  try {
    console.log(`🔍 Buscando usuário: ${email}`);

    const usuario = await prisma.usuarios.findUnique({
      where: { email },
    });

    if (!usuario) {
      console.log(`❌ Usuário não encontrado: ${email}`);
      process.exit(1);
    }

    console.log(`\n📋 Usuário encontrado:`);
    console.log(`   ID: ${usuario.id}`);
    console.log(`   Nome: ${usuario.nome}`);
    console.log(`   Email: ${usuario.email}`);
    console.log(`   Status atual: ${usuario.status}`);
    console.log(`   is_active: ${usuario.is_active}`);
    console.log(`   Tem senha: ${usuario.senha ? 'SIM' : 'NÃO'}`);

    if (usuario.status === 'Ativo' && usuario.is_active && !usuario.deleted_at) {
      console.log(`\n✅ Usuário já está ativo!`);
      process.exit(0);
    }

    console.log(`\n🔄 Ativando usuário...`);

    const updated = await prisma.usuarios.update({
      where: { email },
      data: {
        status: 'Ativo',
        is_active: true,
        deleted_at: null,
      },
    });

    console.log(`\n✅ Usuário ativado com sucesso!`);
    console.log(`   Status: ${updated.status}`);
    console.log(`   is_active: ${updated.is_active}`);
    console.log(`\n🔐 Use a senha: Aupus123! (senha padrão)`);

  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

ativarUsuario();
