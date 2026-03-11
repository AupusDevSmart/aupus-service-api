// Seed simplificado - apenas anomalias e leituras usando dados existentes
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ADMIN_ID = '01K2CPBYE07B3HWW0CZHHB3ZCR';

async function seedSimple() {
  console.log('\n🌱 SEED SIMPLIFICADO - Anomalias e Leituras\n');
  console.log('='.repeat(80));

  try {
    // 1. LIMPAR ANOMALIAS ANTIGAS
    console.log('\n🗑️  Deletando anomalias antigas...');
    await prisma.anomalias.updateMany({
      where: { deleted_at: null },
      data: { deleted_at: new Date() },
    });
    console.log('   ✅ Anomalias antigas deletadas');

    // 2. BUSCAR PLANTAS
    console.log('\n📍 Buscando plantas...');
    const plantas = await prisma.plantas.findMany({
      where: { deleted_at: null },
      select: { id: true, nome: true },
      take: 3,
    });

    console.log(`   ✅ ${plantas.length} plantas encontradas`);
    plantas.forEach(p => console.log(`      - ${p.nome} (${p.id.substring(0, 10)}...)`));

    // 3. BUSCAR EQUIPAMENTOS
    console.log('\n⚙️  Buscando equipamentos...');
    const equipamentos = await prisma.equipamentos.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        nome: true,
        tipo_equipamento: true,
        planta_id: true,
        unidade_id: true,
      },
      take: 20,
    });

    console.log(`   ✅ ${equipamentos.length} equipamentos encontrados`);

    // 4. CRIAR ANOMALIAS
    console.log('\n⚠️  Criando 20 anomalias...');

    const templates = [
      { desc: 'Superaquecimento detectado', status: 'AGUARDANDO', prioridade: 'ALTA', condicao: 'FUNCIONANDO', origem: 'SCADA' },
      { desc: 'Geração abaixo do esperado', status: 'EM_ANALISE', prioridade: 'MEDIA', condicao: 'FUNCIONANDO', origem: 'OPERADOR' },
      { desc: 'Falha de comunicação intermitente', status: 'AGUARDANDO', prioridade: 'ALTA', condicao: 'FUNCIONANDO', origem: 'FALHA' },
      { desc: 'Manutenção preventiva necessária', status: 'OS_GERADA', prioridade: 'BAIXA', condicao: 'FUNCIONANDO', origem: 'OPERADOR' },
      { desc: 'Tensão fora da faixa normal', status: 'AGUARDANDO', prioridade: 'MEDIA', condicao: 'FUNCIONANDO', origem: 'SCADA' },
      { desc: 'Corrente elevada detectada', status: 'EM_ANALISE', prioridade: 'ALTA', condicao: 'FUNCIONANDO', origem: 'OPERADOR' },
      { desc: 'Degradação de performance', status: 'EM_ANALISE', prioridade: 'MEDIA', condicao: 'FUNCIONANDO', origem: 'SCADA' },
      { desc: 'Limpeza de painéis agendada', status: 'OS_GERADA', prioridade: 'BAIXA', condicao: 'FUNCIONANDO', origem: 'OPERADOR' },
      { desc: 'Fator de potência baixo', status: 'AGUARDANDO', prioridade: 'MEDIA', condicao: 'FUNCIONANDO', origem: 'SCADA' },
      { desc: 'Desconexão não programada', status: 'AGUARDANDO', prioridade: 'ALTA', condicao: 'PARADO', origem: 'FALHA' },
    ];

    for (let i = 0; i < 20; i++) {
      const template = templates[i % templates.length];
      const planta = plantas[i % plantas.length];
      const equipamento = equipamentos[i % equipamentos.length];

      const horasAtras = Math.floor(Math.random() * 72) + 1;
      const dataAnomalia = new Date();
      dataAnomalia.setHours(dataAnomalia.getHours() - horasAtras);

      await prisma.anomalias.create({
        data: {
          descricao: `${template.desc} - ${equipamento.nome}`,
          local: equipamento.nome,
          ativo: equipamento.nome,
          data: dataAnomalia,
          status: template.status,
          prioridade: template.prioridade,
          condicao: template.condicao,
          origem: template.origem,
          planta_id: planta.id,  // ✅ COM PLANTA!
          equipamento_id: equipamento.id,
          usuario_id: ADMIN_ID,
          criado_por: 'Sistema Automático',
        },
      });

      if ((i + 1) % 5 === 0) {
        console.log(`   ${i + 1} anomalias criadas...`);
      }
    }

    console.log('   ✅ 20 anomalias criadas');

    // 5. VALIDAÇÃO
    console.log('\n✅ VALIDAÇÃO\n');

    const stats = {
      total: await prisma.anomalias.count({ where: { deleted_at: null } }),
      comPlanta: await prisma.anomalias.count({ where: { deleted_at: null, planta_id: { not: null } } }),
      aguardando: await prisma.anomalias.count({ where: { deleted_at: null, status: 'AGUARDANDO' } }),
      emAnalise: await prisma.anomalias.count({ where: { deleted_at: null, status: 'EM_ANALISE' } }),
      osGerada: await prisma.anomalias.count({ where: { deleted_at: null, status: 'OS_GERADA' } }),
    };

    console.log(`   Total de anomalias: ${stats.total}`);
    console.log(`   └─ Com planta: ${stats.comPlanta}`);
    console.log(`   └─ Aguardando: ${stats.aguardando}`);
    console.log(`   └─ Em análise: ${stats.emAnalise}`);
    console.log(`   └─ OS Gerada: ${stats.osGerada}`);

    console.log('\n' + '='.repeat(80));
    console.log('\n🎉 SEED CONCLUÍDO!\n');
    console.log('📝 Próximos passos:');
    console.log('   1. Reiniciar backend');
    console.log('   2. Acessar: http://localhost:5173/dashboard');
    console.log('   3. Verificar card "Anomalias Ativas"');
    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

seedSimple();
