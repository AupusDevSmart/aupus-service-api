const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCreatedBy() {
  try {
    console.log('🔍 Verificando últimos 5 usuários criados...\n');

    const users = await prisma.usuarios.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        nome: true,
        email: true,
        created_by: true,
        role: true,
        created_at: true
      },
      orderBy: { created_at: 'desc' },
      take: 5
    });

    users.forEach((user, index) => {
      console.log(`\n${index + 1}. ${user.nome} (${user.email})`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Created By: ${user.created_by || 'NULL'}`);
      console.log(`   Created At: ${user.created_at}`);
    });

    console.log('\n✅ Verificação concluída!');
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkCreatedBy();
