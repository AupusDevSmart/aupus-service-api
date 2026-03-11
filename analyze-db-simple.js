// Script simplificado para análise do banco
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function analyzeDatabase() {
  console.log('\n🔍 ANÁLISE SIMPLIFICADA DO BANCO\n');
  console.log('='.repeat(80));

  try {
    // 1. USUÁRIO ADMIN
    const admin = await prisma.usuarios.findFirst({
      where: {
        deleted_at: null,
        email: { contains: 'smart@aupusenergia.com.br' },
      },
      select: { id: true, nome: true, email: true },
    });

    console.log('\n👥 USUÁRIO ADMIN');
    console.log(`   Nome: ${admin.nome}`);
    console.log(`   ID: ${admin.id}`);
    console.log(`   Email: ${admin.email}`);

    // 2. PLANTAS DO ADMIN
    const plantas = await prisma.plantas.findMany({
      where: {
        deleted_at: null,
        proprietario_id: admin.id,
      },
      select: { id: true, nome: true },
    });

    console.log(`\n🏭 PLANTAS DO ADMIN (${plantas.length})`);
    plantas.forEach(p => console.log(`   - ${p.nome} (${p.id})`));

    // 3. UNIDADES
    const unidades = await prisma.unidades.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        nome: true,
        tipo: true,
        planta_id: true,
        cidade: true,
        estado: true,
        latitude: true,
        longitude: true,
      },
      orderBy: { created_at: 'desc' },
      take: 10,
    });

    console.log(`\n🏢 UNIDADES (${unidades.length})`);
    unidades.forEach(u => {
      console.log(`   - ${u.nome} (${u.tipo})`);
      console.log(`     ID: ${u.id}`);
      console.log(`     Planta: ${u.planta_id || 'N/A'}`);
      console.log(`     Local: ${u.cidade || 'N/A'}, ${u.estado || 'N/A'}`);
      console.log(`     Coords: ${u.latitude ? `${u.latitude}, ${u.longitude}` : 'N/A'}`);
    });

    // 4. EQUIPAMENTOS
    const equipamentos = await prisma.equipamentos.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        nome: true,
        tipo_equipamento: true,
        planta_id: true,
        unidade_id: true,
        topico_mqtt: true,
      },
      orderBy: { created_at: 'desc' },
      take: 15,
    });

    console.log(`\n⚙️  EQUIPAMENTOS (${equipamentos.length})`);
    equipamentos.forEach(e => {
      console.log(`   - ${e.nome} (${e.tipo_equipamento || 'N/A'})`);
      console.log(`     ID: ${e.id}`);
      console.log(`     Planta: ${e.planta_id || 'N/A'}`);
      console.log(`     Unidade: ${e.unidade_id || 'N/A'}`);
      console.log(`     MQTT: ${e.topico_mqtt || 'N/A'}`);
    });

    // 5. ESTATÍSTICAS
    console.log('\n📊 ESTATÍSTICAS');
    const stats = {
      usuarios: await prisma.usuarios.count({ where: { deleted_at: null } }),
      plantas: await prisma.plantas.count({ where: { deleted_at: null } }),
      unidades: await prisma.unidades.count({ where: { deleted_at: null } }),
      equipamentos: await prisma.equipamentos.count({ where: { deleted_at: null } }),
      anomalias: await prisma.anomalias.count({ where: { deleted_at: null } }),
      anomaliasComPlanta: await prisma.anomalias.count({ where: { deleted_at: null, planta_id: { not: null } } }),
      anomaliasSemPlanta: await prisma.anomalias.count({ where: { deleted_at: null, planta_id: null } }),
    };

    console.log(`   Usuários: ${stats.usuarios}`);
    console.log(`   Plantas: ${stats.plantas}`);
    console.log(`   Unidades: ${stats.unidades}`);
    console.log(`   Equipamentos: ${stats.equipamentos}`);
    console.log(`   Anomalias: ${stats.anomalias}`);
    console.log(`   └─ Com planta: ${stats.anomaliasComPlanta}`);
    console.log(`   └─ Sem planta: ${stats.anomaliasSemPlanta}`);

    // 6. DADOS EXPORTADOS
    console.log('\n' + '='.repeat(80));
    console.log('\n📝 DADOS PARA SEED:\n');
    console.log(`const ADMIN_ID = '${admin.id}';`);
    if (plantas[0]) {
      console.log(`const PLANTA_ID = '${plantas[0].id}'; // ${plantas[0].nome}`);
    }
    if (unidades[0]) {
      console.log(`const UNIDADE_ID = '${unidades[0].id}'; // ${unidades[0].nome}`);
    }
    if (equipamentos[0]) {
      console.log(`const EQUIPAMENTO_ID = '${equipamentos[0].id}'; // ${equipamentos[0].nome}`);
    }

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeDatabase();
