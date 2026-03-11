// Seed para criar anomalias na planta do Admin
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ADMIN_ID = '01K2CPBYE07B3HWW0CZHHB3ZCR';
const PLANTA_ADMIN_ID = 'cmkfrzdae00fl2f5wui3mvx9l'; // Aupus Energia

async function seedAdminPlant() {
  console.log('\n🌱 CRIANDO ANOMALIAS PARA PLANTA DO ADMIN\n');
  console.log('='.repeat(80));

  try {
    // 1. Deletar anomalias antigas
    console.log('\n🗑️  Deletando anomalias antigas...');
    await prisma.anomalias.updateMany({
      where: { deleted_at: null },
      data: { deleted_at: new Date() },
    });
    console.log('   ✅ Deletadas');

    // 2. Buscar equipamentos da planta do Admin
    console.log('\n⚙️  Buscando equipamentos da planta do Admin...');

    const equipamentos = await prisma.equipamentos.findMany({
      where: {
        deleted_at: null,
        planta_id: PLANTA_ADMIN_ID,
      },
      select: {
        id: true,
        nome: true,
      },
    });

    console.log(`   ✅ ${equipamentos.length} equipamentos encontrados`);

    if (equipamentos.length === 0) {
      console.log('\n   ⚠️  Nenhum equipamento na planta do Admin!');
      console.log('   Buscando qualquer equipamento...\n');

      const anyEquipamentos = await prisma.equipamentos.findMany({
        where: { deleted_at: null },
        select: { id: true, nome: true },
        take: 10,
      });

      equipamentos.push(...anyEquipamentos);
      console.log(`   ✅ Usando ${equipamentos.length} equipamentos genéricos`);
    }

    // 3. Criar 20 anomalias
    console.log('\n⚠️  Criando 20 anomalias para planta do Admin...');

    const templates = [
      { desc: 'Superaquecimento detectado', status: 'AGUARDANDO', prioridade: 'ALTA', condicao: 'FUNCIONANDO', origem: 'SCADA' },
      { desc: 'Geração abaixo do esperado', status: 'EM_ANALISE', prioridade: 'MEDIA', condicao: 'FUNCIONANDO', origem: 'OPERADOR' },
      { desc: 'Falha de comunicação', status: 'AGUARDANDO', prioridade: 'ALTA', condicao: 'FUNCIONANDO', origem: 'FALHA' },
      { desc: 'Manutenção preventiva', status: 'OS_GERADA', prioridade: 'BAIXA', condicao: 'FUNCIONANDO', origem: 'OPERADOR' },
      { desc: 'Tensão fora da faixa', status: 'AGUARDANDO', prioridade: 'MEDIA', condicao: 'FUNCIONANDO', origem: 'SCADA' },
      { desc: 'Corrente elevada', status: 'EM_ANALISE', prioridade: 'ALTA', condicao: 'FUNCIONANDO', origem: 'OPERADOR' },
      { desc: 'Degradação de performance', status: 'EM_ANALISE', prioridade: 'MEDIA', condicao: 'FUNCIONANDO', origem: 'SCADA' },
      { desc: 'Limpeza necessária', status: 'OS_GERADA', prioridade: 'BAIXA', condicao: 'FUNCIONANDO', origem: 'OPERADOR' },
      { desc: 'Fator de potência baixo', status: 'AGUARDANDO', prioridade: 'MEDIA', condicao: 'FUNCIONANDO', origem: 'SCADA' },
      { desc: 'Desconexão inesperada', status: 'AGUARDANDO', prioridade: 'ALTA', condicao: 'PARADO', origem: 'FALHA' },
    ];

    for (let i = 0; i < 20; i++) {
      const template = templates[i % templates.length];
      const equipamento = equipamentos[i % equipamentos.length];
      const horasAtras = Math.floor(Math.random() * 72) + 1;
      const dataAnomalia = new Date();
      dataAnomalia.setHours(dataAnomalia.getHours() - horasAtras);

      await prisma.anomalias.create({
        data: {
          descricao: `${template.desc} - ${equipamento.nome} (#${i + 1})`,
          local: equipamento.nome,
          ativo: equipamento.nome,
          data: dataAnomalia,
          status: template.status,
          prioridade: template.prioridade,
          condicao: template.condicao,
          origem: template.origem,
          planta_id: PLANTA_ADMIN_ID,  // ✅ PLANTA DO ADMIN!
          equipamento_id: equipamento.id,
          usuario_id: ADMIN_ID,
          criado_por: 'Sistema Automático',
        },
      });

      if ((i + 1) % 5 === 0) {
        console.log(`   ${i + 1} anomalias criadas...`);
      }
    }

    console.log('   ✅ 20 anomalias criadas!');

    // 4. Validação
    console.log('\n✅ VALIDAÇÃO\n');

    const stats = {
      total: await prisma.anomalias.count({
        where: {
          deleted_at: null,
          planta_id: PLANTA_ADMIN_ID,
        },
      }),
      aguardando: await prisma.anomalias.count({
        where: {
          deleted_at: null,
          planta_id: PLANTA_ADMIN_ID,
          status: 'AGUARDANDO',
        },
      }),
    };

    console.log(`   Anomalias na planta ${PLANTA_ADMIN_ID.substring(0, 10)}...: ${stats.total}`);
    console.log(`   └─ Aguardando: ${stats.aguardando}`);

    console.log('\n' + '='.repeat(80));
    console.log('\n🎉 SEED CONCLUÍDO!\n');
    console.log('📝 Faça login com: smart@aupusenergia.com.br');
    console.log('   O Admin deve ver 20 anomalias da planta "Aupus Energia"');
    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

seedAdminPlant();
