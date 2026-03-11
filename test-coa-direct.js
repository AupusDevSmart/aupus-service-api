// Script direto para testar COA sem HTTP - acessa o serviço diretamente
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testCOADirect() {
  console.log('\n🔍 TESTANDO LÓGICA COA DIRETAMENTE\n');
  console.log('='.repeat(80));

  try {
    // 1. Buscar um usuário qualquer
    const usuario = await prisma.usuarios.findFirst({
      where: {
        deleted_at: null,
      },
      select: {
        id: true,
        nome: true,
        email: true,
      },
    });

    if (!usuario) {
      console.error('❌ Nenhum usuário encontrado no banco!');
      return;
    }

    console.log(`\n✅ Usuário encontrado: ${usuario.nome} (${usuario.email})`);
    console.log(`   ID: ${usuario.id}`);

    // 2. Buscar plantas deste usuário
    const plantas = await prisma.plantas.findMany({
      where: {
        deleted_at: null,
        proprietario_id: usuario.id,
      },
      select: {
        id: true,
        nome: true,
      },
    });

    console.log(`\n📍 Plantas do usuário: ${plantas.length}`);
    plantas.forEach(p => console.log(`   - ${p.nome} (${p.id})`));

    if (plantas.length === 0) {
      console.log('\n⚠️  Usuário não possui plantas!');
      console.log('   Vou buscar anomalias de TODAS as plantas para teste...\n');
    }

    // 3. Buscar anomalias ativas (filtradas por plantas do usuário OU todas se não tiver plantas)
    const statusAtivos = ['AGUARDANDO', 'EM_ANALISE', 'OS_GERADA'];

    const whereClause = {
      deleted_at: null,
      status: {
        in: statusAtivos,
      },
      ...(plantas.length > 0 && {
        planta_id: {
          in: plantas.map(p => p.id),
        },
      }),
    };

    const anomaliasAtivas = await prisma.anomalias.findMany({
      where: whereClause,
      select: {
        id: true,
        descricao: true,
        status: true,
        prioridade: true,
        data: true,
        planta_id: true,
        planta: {
          select: {
            id: true,
            nome: true,
          },
        },
        equipamento: {
          select: {
            id: true,
            nome: true,
            unidade_id: true,
          },
        },
      },
      orderBy: {
        data: 'desc',
      },
      take: 50,
    });

    console.log(`\n⚠️  ANOMALIAS ATIVAS ENCONTRADAS: ${anomaliasAtivas.length}`);

    if (anomaliasAtivas.length > 0) {
      console.log('\n📋 ANOMALIAS (primeiras 5):\n');
      anomaliasAtivas.slice(0, 5).forEach((anomalia, index) => {
        console.log(`${index + 1}. ${anomalia.descricao.substring(0, 60)}...`);
        console.log(`   Status: ${anomalia.status} | Prioridade: ${anomalia.prioridade}`);
        console.log(`   Planta ID: ${anomalia.planta_id || 'null'}`);
        console.log(`   Planta: ${anomalia.planta?.nome || 'N/A'}`);
        console.log('');
      });

      // Verificar se anomalias têm planta_id
      const anomaliasSemPlanta = anomaliasAtivas.filter(a => !a.planta_id);
      if (anomaliasSemPlanta.length > 0) {
        console.log(`\n⚠️  ${anomaliasSemPlanta.length} anomalias SEM planta_id!`);
        console.log('   Estas anomalias não aparecerão no dashboard se o filtro por planta estiver ativo.\n');
      }

    } else {
      console.log('\n❌ Nenhuma anomalia ativa encontrada!');

      if (plantas.length > 0) {
        console.log('\n   Verificando se há anomalias em OUTRAS plantas...\n');

        const todasAnomalias = await prisma.anomalias.findMany({
          where: {
            deleted_at: null,
            status: {
              in: statusAtivos,
            },
          },
          select: {
            id: true,
            planta_id: true,
            planta: {
              select: {
                nome: true,
              },
            },
          },
          take: 10,
        });

        console.log(`   Total de anomalias ativas no sistema: ${todasAnomalias.length}`);

        if (todasAnomalias.length > 0) {
          console.log('   Plantas dessas anomalias:');
          const plantasComAnomalias = [...new Set(todasAnomalias.map(a => a.planta_id))];
          plantasComAnomalias.forEach(pid => {
            const anomalia = todasAnomalias.find(a => a.planta_id === pid);
            console.log(`      - ${anomalia?.planta?.nome || 'N/A'} (${pid || 'null'})`);
          });

          console.log('\n   🔍 PROBLEMA IDENTIFICADO:');
          console.log('   As anomalias pertencem a plantas diferentes das do usuário testado!');
          console.log('   Solução: Associar anomalias às plantas corretas ou testar com usuário admin.');
        }
      }
    }

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

testCOADirect();
