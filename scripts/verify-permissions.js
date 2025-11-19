const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifyPermissions() {
  console.log('═'.repeat(60));
  console.log('  VERIFICAÇÃO DE PERMISSÕES');
  console.log('═'.repeat(60));
  console.log();

  try {
    // Total de permissões
    const total = await prisma.permissions.count();
    console.log(`📊 Total de permissões no banco: ${total}`);
    console.log();

    // Permissões modernas (com ponto)
    const modernas = await prisma.permissions.count({
      where: {
        name: {
          contains: '.'
        }
      }
    });
    console.log(`✨ Permissões modernas (recurso.acao): ${modernas}`);
    console.log();

    // Permissões legadas (sem ponto)
    const legadas = await prisma.permissions.count({
      where: {
        name: {
          not: {
            contains: '.'
          }
        }
      }
    });
    console.log(`📜 Permissões legadas (PascalCase): ${legadas}`);
    console.log();

    // Agrupar por recurso
    console.log('📋 Permissões por recurso:');
    console.log('─'.repeat(60));

    const permissions = await prisma.permissions.findMany({
      where: {
        name: {
          contains: '.'
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    const grouped = {};
    permissions.forEach(p => {
      const [recurso] = p.name.split('.');
      if (!grouped[recurso]) {
        grouped[recurso] = [];
      }
      grouped[recurso].push(p.name);
    });

    Object.entries(grouped).forEach(([recurso, perms]) => {
      console.log(`\n${recurso.toUpperCase()} (${perms.length})`);
      perms.forEach(p => console.log(`  ✓ ${p}`));
    });

    console.log();
    console.log('═'.repeat(60));
    console.log('✅ Verificação concluída!');
    console.log('═'.repeat(60));

  } catch (error) {
    console.error('❌ Erro ao verificar permissões:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyPermissions();
