// Script para analisar estrutura do banco e IDs existentes
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function analyzeDatabase() {
  console.log('\n🔍 ANÁLISE COMPLETA DO BANCO DE DADOS\n');
  console.log('='.repeat(80));

  try {
    // 1. USUÁRIOS
    console.log('\n👥 USUÁRIOS\n');
    const usuarios = await prisma.usuarios.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        nome: true,
        email: true,
        cpf_cnpj: true,
        _count: {
          select: {
            plantas_proprietario: true,
          },
        },
      },
      take: 5,
    });

    usuarios.forEach(u => {
      console.log(`   ${u.nome}`);
      console.log(`   └─ ID: ${u.id}`);
      console.log(`   └─ Email: ${u.email}`);
      console.log(`   └─ CPF: ${u.cpf || 'N/A'}`);
      console.log(`   └─ Plantas: ${u._count.plantas_proprietario}`);
      console.log('');
    });

    // 2. PLANTAS
    console.log('\n🏭 PLANTAS\n');
    const plantas = await prisma.plantas.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        nome: true,
        proprietario_id: true,
        proprietario: {
          select: {
            nome: true,
          },
        },
        _count: {
          select: {
            equipamentos: true,
            anomalias: true,
          },
        },
      },
      take: 5,
    });

    if (plantas.length === 0) {
      console.log('   ⚠️  Nenhuma planta encontrada!\n');
    } else {
      plantas.forEach(p => {
        console.log(`   ${p.nome}`);
        console.log(`   └─ ID: ${p.id}`);
        console.log(`   └─ Proprietário: ${p.proprietario.nome} (${p.proprietario_id})`);
        console.log(`   └─ Equipamentos: ${p._count.equipamentos}`);
        console.log(`   └─ Anomalias: ${p._count.anomalias}`);
        console.log('');
      });
    }

    // 3. UNIDADES
    console.log('\n🏢 UNIDADES CONSUMIDORAS\n');
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
        _count: {
          select: {
            equipamentos: true,
          },
        },
      },
      take: 5,
    });

    if (unidades.length === 0) {
      console.log('   ⚠️  Nenhuma unidade encontrada!\n');
    } else {
      unidades.forEach(u => {
        console.log(`   ${u.nome} (${u.tipo})`);
        console.log(`   └─ ID: ${u.id}`);
        console.log(`   └─ Planta ID: ${u.planta_id || 'N/A'}`);
        console.log(`   └─ Localização: ${u.cidade || 'N/A'}, ${u.estado || 'N/A'}`);
        console.log(`   └─ Coordenadas: ${u.latitude ? `${u.latitude}, ${u.longitude}` : 'N/A'}`);
        console.log(`   └─ Equipamentos: ${u._count.equipamentos}`);
        console.log('');
      });
    }

    // 4. EQUIPAMENTOS
    console.log('\n⚙️  EQUIPAMENTOS\n');
    const equipamentos = await prisma.equipamentos.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        nome: true,
        tipo_equipamento: true,
        planta_id: true,
        unidade_id: true,
        topico_mqtt: true,
        _count: {
          select: {
            equipamentos_dados: true,
            anomalias: true,
          },
        },
      },
      take: 10,
    });

    if (equipamentos.length === 0) {
      console.log('   ⚠️  Nenhum equipamento encontrado!\n');
    } else {
      equipamentos.forEach(e => {
        console.log(`   ${e.nome} (${e.tipo_equipamento || 'N/A'})`);
        console.log(`   └─ ID: ${e.id}`);
        console.log(`   └─ Planta ID: ${e.planta_id || 'N/A'}`);
        console.log(`   └─ Unidade ID: ${e.unidade_id || 'N/A'}`);
        console.log(`   └─ Tópico MQTT: ${e.topico_mqtt || 'N/A'}`);
        console.log(`   └─ Dados: ${e._count.equipamentos_dados}`);
        console.log(`   └─ Anomalias: ${e._count.anomalias}`);
        console.log('');
      });
    }

    // 5. ANOMALIAS EXISTENTES
    console.log('\n⚠️  ANOMALIAS EXISTENTES\n');
    const anomalias = await prisma.anomalias.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        descricao: true,
        status: true,
        prioridade: true,
        planta_id: true,
        equipamento_id: true,
        data: true,
      },
      orderBy: {
        data: 'desc',
      },
      take: 5,
    });

    console.log(`   Total: ${anomalias.length}`);
    anomalias.forEach(a => {
      console.log(`   - [${a.status}/${a.prioridade}] ${a.descricao.substring(0, 50)}...`);
      console.log(`     └─ Planta ID: ${a.planta_id || 'NULL'} | Equipamento ID: ${a.equipamento_id || 'NULL'}`);
    });

    // 6. ESTATÍSTICAS GERAIS
    console.log('\n\n📊 ESTATÍSTICAS GERAIS\n');

    const [
      totalUsuarios,
      totalPlantas,
      totalUnidades,
      totalEquipamentos,
      totalAnomalias,
      anomaliasAguardando,
      anomaliasEmAnalise,
    ] = await Promise.all([
      prisma.usuarios.count({ where: { deleted_at: null } }),
      prisma.plantas.count({ where: { deleted_at: null } }),
      prisma.unidades.count({ where: { deleted_at: null } }),
      prisma.equipamentos.count({ where: { deleted_at: null } }),
      prisma.anomalias.count({ where: { deleted_at: null } }),
      prisma.anomalias.count({ where: { deleted_at: null, status: 'AGUARDANDO' } }),
      prisma.anomalias.count({ where: { deleted_at: null, status: 'EM_ANALISE' } }),
    ]);

    console.log(`   Usuários: ${totalUsuarios}`);
    console.log(`   Plantas: ${totalPlantas}`);
    console.log(`   Unidades: ${totalUnidades}`);
    console.log(`   Equipamentos: ${totalEquipamentos}`);
    console.log(`   Anomalias: ${totalAnomalias}`);
    console.log(`   └─ Aguardando: ${anomaliasAguardando}`);
    console.log(`   └─ Em análise: ${anomaliasEmAnalise}`);

    // 7. VERIFICAR RELAÇÕES
    console.log('\n\n🔗 VERIFICAÇÃO DE RELAÇÕES\n');

    const plantasSemProprietario = await prisma.plantas.count({
      where: {
        deleted_at: null,
        proprietario_id: null,
      },
    });

    const equipamentosSemUnidade = await prisma.equipamentos.count({
      where: {
        deleted_at: null,
        unidade_id: null,
      },
    });

    const equipamentosSemPlanta = await prisma.equipamentos.count({
      where: {
        deleted_at: null,
        planta_id: null,
      },
    });

    const anomaliasSemPlanta = await prisma.anomalias.count({
      where: {
        deleted_at: null,
        planta_id: null,
      },
    });

    const anomaliasSemEquipamento = await prisma.anomalias.count({
      where: {
        deleted_at: null,
        equipamento_id: null,
      },
    });

    console.log(`   ⚠️  Plantas sem proprietário: ${plantasSemProprietario}`);
    console.log(`   ⚠️  Equipamentos sem unidade: ${equipamentosSemUnidade}`);
    console.log(`   ⚠️  Equipamentos sem planta: ${equipamentosSemPlanta}`);
    console.log(`   ⚠️  Anomalias sem planta: ${anomaliasSemPlanta}`);
    console.log(`   ⚠️  Anomalias sem equipamento: ${anomaliasSemEquipamento}`);

    console.log('\n' + '='.repeat(80) + '\n');

    // 8. EXPORTAR DADOS PARA SEED
    console.log('📝 DADOS PARA SEED SCRIPT:\n');

    const primeiroUsuario = usuarios[0];
    const primeiraPlanta = plantas[0];
    const primeiraUnidade = unidades[0];
    const primeiroEquipamento = equipamentos[0];

    if (primeiroUsuario) {
      console.log(`const USUARIO_ID = '${primeiroUsuario.id}'; // ${primeiroUsuario.nome}`);
    }
    if (primeiraPlanta) {
      console.log(`const PLANTA_ID = '${primeiraPlanta.id}'; // ${primeiraPlanta.nome}`);
    }
    if (primeiraUnidade) {
      console.log(`const UNIDADE_ID = '${primeiraUnidade.id}'; // ${primeiraUnidade.nome}`);
    }
    if (primeiroEquipamento) {
      console.log(`const EQUIPAMENTO_ID = '${primeiroEquipamento.id}'; // ${primeiroEquipamento.nome}`);
    }

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeDatabase();
