// Script para debugar contagem de anomalias
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ADMIN_ID = '01K2CPBYE07B3HWW0CZHHB3ZCR';

async function debugAnomaliasCount() {
  console.log('\n🔍 DEBUG: Contagem de Anomalias\n');
  console.log('='.repeat(80));

  try {
    // 1. Verificar usuário
    console.log('\n👤 Verificando usuário...');
    const usuario = await prisma.usuarios.findUnique({
      where: { id: ADMIN_ID },
      select: { id: true, nome: true, email: true, role: true }
    });

    if (!usuario) {
      console.log('❌ Usuário não encontrado!');
      return;
    }

    console.log(`   Nome: ${usuario.nome}`);
    console.log(`   Email: ${usuario.email}`);
    console.log(`   Role: ${usuario.role}`);
    console.log(`   ID: ${usuario.id}`);

    const isAdmin = usuario.role === 'admin' || usuario.role === 'super_admin';
    console.log(`   É Admin? ${isAdmin ? 'SIM' : 'NÃO'}`);

    // 2. Contagem total de anomalias (sem filtros)
    console.log('\n📊 Contagem de anomalias:');

    const totalSemFiltro = await prisma.anomalias.count();
    console.log(`   Total absoluto (sem filtros): ${totalSemFiltro}`);

    const totalComDeletedAt = await prisma.anomalias.count({
      where: { deleted_at: { not: null } }
    });
    console.log(`   Total deletadas: ${totalComDeletedAt}`);

    const totalAtivas = await prisma.anomalias.count({
      where: { deleted_at: null }
    });
    console.log(`   Total ativas (deleted_at = null): ${totalAtivas}`);

    // 3. Simulando o filtro baseFilter
    const baseFilter = {
      deleted_at: null,
      ...(isAdmin ? {} : {})
    };

    const totalComBaseFilter = await prisma.anomalias.count({
      where: baseFilter
    });
    console.log(`   Total com baseFilter: ${totalComBaseFilter}`);

    // 4. Anomalias abertas
    const anomaliasAbertas = await prisma.anomalias.count({
      where: {
        ...baseFilter,
        status: {
          in: ['AGUARDANDO', 'EM_ANALISE', 'OS_GERADA']
        }
      }
    });
    console.log(`   Anomalias abertas: ${anomaliasAbertas}`);

    // 5. Por status
    console.log('\n📋 Por status:');
    const statusCounts = await prisma.anomalias.groupBy({
      by: ['status'],
      where: { deleted_at: null },
      _count: true
    });

    statusCounts.forEach(s => {
      console.log(`   ${s.status}: ${s._count}`);
    });

    // 6. Amostras de anomalias
    console.log('\n📝 Amostras de anomalias ativas:');
    const amostras = await prisma.anomalias.findMany({
      where: { deleted_at: null },
      take: 5,
      select: {
        id: true,
        descricao: true,
        status: true,
        created_at: true,
        deleted_at: true
      },
      orderBy: { created_at: 'desc' }
    });

    amostras.forEach((a, idx) => {
      console.log(`   ${idx + 1}. ${a.descricao.substring(0, 50)}...`);
      console.log(`      Status: ${a.status}`);
      console.log(`      ID: ${a.id.substring(0, 15)}...`);
      console.log(`      Deleted: ${a.deleted_at || 'null'}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Debug concluído!\n');

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

debugAnomaliasCount();
