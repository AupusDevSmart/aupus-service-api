// Script para debugar endpoint COA sem precisar de autenticação
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function debugCOA() {
  console.log('\n🔍 DEBUG DO ENDPOINT COA\n');
  console.log('='.repeat(80));

  try {
    // 1. VERIFICAR ANOMALIAS NO BANCO
    console.log('\n1️⃣ VERIFICANDO ANOMALIAS NO BANCO:\n');

    const anomaliasAtivas = await prisma.anomalias.findMany({
      where: {
        deleted_at: null,
        status: {
          in: ['AGUARDANDO', 'EM_ANALISE', 'OS_GERADA'],
        },
      },
      select: {
        id: true,
        descricao: true,
        status: true,
        planta_id: true,
        planta: {
          select: {
            nome: true,
            proprietario_id: true,
            proprietario: {
              select: {
                nome: true,
                email: true,
              },
            },
          },
        },
      },
      take: 5,
    });

    console.log(`   Total de anomalias ativas: ${anomaliasAtivas.length}`);

    if (anomaliasAtivas.length > 0) {
      console.log('\n   Primeiras 5 anomalias:\n');
      anomaliasAtivas.forEach((a, i) => {
        console.log(`   ${i + 1}. ${a.descricao.substring(0, 50)}...`);
        console.log(`      Status: ${a.status}`);
        console.log(`      Planta ID: ${a.planta_id || 'NULL'}`);
        console.log(`      Planta: ${a.planta?.nome || 'N/A'}`);
        console.log(`      Proprietário: ${a.planta?.proprietario?.nome || 'N/A'} (${a.planta?.proprietario_id || 'N/A'})`);
        console.log('');
      });
    }

    // 2. VERIFICAR PLANTAS
    console.log('\n2️⃣ VERIFICANDO PLANTAS:\n');

    const plantas = await prisma.plantas.findMany({
      where: {
        deleted_at: null,
      },
      select: {
        id: true,
        nome: true,
        proprietario_id: true,
        proprietario: {
          select: {
            nome: true,
            email: true,
          },
        },
        _count: {
          select: {
            anomalias: true,
          },
        },
      },
      take: 10,
    });

    console.log(`   Total de plantas: ${plantas.length}\n`);
    plantas.forEach(p => {
      console.log(`   - ${p.nome}`);
      console.log(`     ID: ${p.id}`);
      console.log(`     Proprietário: ${p.proprietario.nome} (${p.proprietario_id})`);
      console.log(`     Anomalias: ${p._count.anomalias}`);
      console.log('');
    });

    // 3. SIMULAR LÓGICA DO BACKEND
    console.log('\n3️⃣ SIMULANDO LÓGICA DO COA SERVICE:\n');

    // Pegar um usuário qualquer para testar
    const usuario = await prisma.usuarios.findFirst({
      where: { deleted_at: null },
      select: { id: true, nome: true },
    });

    console.log(`   Usuário de teste: ${usuario.nome} (${usuario.id})`);

    // Buscar plantas do usuário (como no backend)
    const plantasUsuario = await prisma.plantas.findMany({
      where: {
        deleted_at: null,
        proprietario_id: usuario.id,
      },
      select: {
        id: true,
        nome: true,
      },
    });

    console.log(`   Plantas do usuário: ${plantasUsuario.length}`);
    plantasUsuario.forEach(p => console.log(`      - ${p.nome} (${p.id})`));

    // Buscar anomalias com filtro OR (como corrigimos)
    const anomaliasComFiltro = await prisma.anomalias.findMany({
      where: {
        deleted_at: null,
        status: {
          in: ['AGUARDANDO', 'EM_ANALISE', 'OS_GERADA'],
        },
        OR: [
          {
            planta_id: {
              in: plantasUsuario.map(p => p.id),
            },
          },
          {
            planta_id: null,
          },
        ],
      },
    });

    console.log(`\n   ✅ Anomalias encontradas com filtro OR: ${anomaliasComFiltro.length}`);

    // Buscar anomalias SEM filtro por planta (todas)
    const todasAnomalias = await prisma.anomalias.findMany({
      where: {
        deleted_at: null,
        status: {
          in: ['AGUARDANDO', 'EM_ANALISE', 'OS_GERADA'],
        },
      },
    });

    console.log(`   ✅ Total de anomalias ativas (sem filtro): ${todasAnomalias.length}`);

    // 4. ANÁLISE
    console.log('\n' + '='.repeat(80));
    console.log('\n💡 ANÁLISE:\n');

    if (todasAnomalias.length === 0) {
      console.log('   ❌ NENHUMA ANOMALIA ATIVA NO BANCO!');
      console.log('   Execute: node seed-simple.js');
    } else if (anomaliasComFiltro.length === 0 && plantasUsuario.length > 0) {
      console.log('   ⚠️  HÁ ANOMALIAS, MAS O FILTRO ESTÁ BLOQUEANDO!');
      console.log(`   Total no banco: ${todasAnomalias.length}`);
      console.log(`   Retornado com filtro: ${anomaliasComFiltro.length}`);
      console.log('\n   Possíveis causas:');
      console.log('   1. Anomalias não estão associadas às plantas do usuário');
      console.log('   2. Lógica do filtro OR não está funcionando');
      console.log('   3. Plantas do usuário não têm anomalias');
    } else if (plantasUsuario.length === 0) {
      console.log('   ⚠️  USUÁRIO NÃO TEM PLANTAS!');
      console.log(`   Anomalias com planta_id null: ${anomaliasComFiltro.length}`);
      console.log('   O filtro OR deveria retornar anomalias sem planta.');
    } else {
      console.log(`   ✅ TUDO CERTO! ${anomaliasComFiltro.length} anomalias devem aparecer.`);
      console.log('\n   Se ainda mostra 0 no dashboard:');
      console.log('   1. Backend NÃO foi reiniciado com as mudanças');
      console.log('   2. Frontend está usando API remota (não localhost)');
      console.log('   3. Há filtro adicional no frontend');
    }

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ ERRO:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

debugCOA();
