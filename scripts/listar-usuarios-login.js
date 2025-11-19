// Script para listar usuários que podem fazer login
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function listarUsuarios() {
  try {
    console.log('🔍 Buscando usuários com senha definida...\n');

    const usuarios = await prisma.usuarios.findMany({
      where: {
        email: {
          contains: '@',
        },
        senha: {
          not: null,
        },
      },
      select: {
        id: true,
        nome: true,
        email: true,
        status: true,
        is_active: true,
        deleted_at: true,
        created_at: true,
      },
      orderBy: {
        created_at: 'desc',
      },
      take: 10,
    });

    if (usuarios.length === 0) {
      console.log('❌ Nenhum usuário encontrado com senha definida.');
      console.log('\n💡 Para criar um usuário de teste, use:');
      console.log('   POST http://localhost:3000/api/v1/usuarios');
      console.log('   { "nome": "Teste", "email": "teste@aupus.com", "status": "Ativo" }');
      process.exit(0);
    }

    console.log(`✅ Encontrados ${usuarios.length} usuários:\n`);
    console.log('─'.repeat(100));

    usuarios.forEach((u, index) => {
      const ativo = u.status === 'Ativo' && u.is_active && !u.deleted_at;
      const statusIcon = ativo ? '✅' : '❌';

      console.log(`${index + 1}. ${statusIcon} ${u.nome}`);
      console.log(`   Email: ${u.email}`);
      console.log(`   Status: ${u.status} | is_active: ${u.is_active} | deleted: ${u.deleted_at ? 'SIM' : 'NÃO'}`);
      console.log(`   Pode fazer login: ${ativo ? 'SIM ✅' : 'NÃO ❌'}`);
      console.log('─'.repeat(100));
    });

    const ativos = usuarios.filter(u => u.status === 'Ativo' && u.is_active && !u.deleted_at);

    console.log(`\n📊 Resumo:`);
    console.log(`   Total de usuários: ${usuarios.length}`);
    console.log(`   Ativos e podem fazer login: ${ativos.length}`);
    console.log(`   Inativos ou deletados: ${usuarios.length - ativos.length}`);

    if (ativos.length > 0) {
      console.log(`\n🔐 Para fazer login, use:`);
      console.log(`   Email: ${ativos[0].email}`);
      console.log(`   Senha: Aupus123! (senha padrão)`);
    } else {
      console.log(`\n⚠️  Nenhum usuário ativo encontrado.`);
      console.log(`\n💡 Para ativar um usuário, use:`);
      console.log(`   node scripts/ativar-usuario.js ${usuarios[0].email}`);
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

listarUsuarios();
