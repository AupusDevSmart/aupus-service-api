// Script para remover espaços em branco dos IDs (CUIDs)
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Iniciando limpeza de IDs com espaços...\n');

  try {
    // Plantas
    console.log('📍 Limpando IDs de plantas...');
    const plantasResult = await prisma.$executeRaw`UPDATE plantas SET id = TRIM(id) WHERE id != TRIM(id)`;
    console.log(`   ✅ ${plantasResult} plantas atualizadas\n`);

    // Unidades
    console.log('🏢 Limpando IDs de unidades...');
    const unidadesIdResult = await prisma.$executeRaw`UPDATE unidades SET id = TRIM(id) WHERE id != TRIM(id)`;
    const unidadesPlantaResult = await prisma.$executeRaw`UPDATE unidades SET planta_id = TRIM(planta_id) WHERE planta_id != TRIM(planta_id)`;
    console.log(`   ✅ ${unidadesIdResult} unidades.id atualizadas`);
    console.log(`   ✅ ${unidadesPlantaResult} unidades.planta_id atualizadas\n`);

    // Equipamentos
    console.log('⚙️  Limpando IDs de equipamentos...');
    const equipamentosIdResult = await prisma.$executeRaw`UPDATE equipamentos SET id = TRIM(id) WHERE id != TRIM(id)`;
    const equipamentosUnidadeResult = await prisma.$executeRaw`UPDATE equipamentos SET unidade_id = TRIM(unidade_id) WHERE unidade_id != TRIM(unidade_id)`;
    console.log(`   ✅ ${equipamentosIdResult} equipamentos.id atualizados`);
    console.log(`   ✅ ${equipamentosUnidadeResult} equipamentos.unidade_id atualizados\n`);

    // Tarefas
    console.log('📋 Limpando IDs de tarefas...');
    const tarefasIdResult = await prisma.$executeRaw`UPDATE tarefas SET id = TRIM(id) WHERE id != TRIM(id)`;
    const tarefasPlanoResult = await prisma.$executeRaw`UPDATE tarefas SET plano_manutencao_id = TRIM(plano_manutencao_id) WHERE plano_manutencao_id IS NOT NULL AND plano_manutencao_id != TRIM(plano_manutencao_id)`;
    const tarefasEquipResult = await prisma.$executeRaw`UPDATE tarefas SET equipamento_id = TRIM(equipamento_id) WHERE equipamento_id IS NOT NULL AND equipamento_id != TRIM(equipamento_id)`;
    const tarefasPlantaResult = await prisma.$executeRaw`UPDATE tarefas SET planta_id = TRIM(planta_id) WHERE planta_id IS NOT NULL AND planta_id != TRIM(planta_id)`;
    console.log(`   ✅ ${tarefasIdResult} tarefas.id atualizadas`);
    console.log(`   ✅ ${tarefasPlanoResult} tarefas.plano_manutencao_id atualizadas`);
    console.log(`   ✅ ${tarefasEquipResult} tarefas.equipamento_id atualizadas`);
    console.log(`   ✅ ${tarefasPlantaResult} tarefas.planta_id atualizadas\n`);

    // Anomalias
    console.log('⚠️  Limpando IDs de anomalias...');
    const anomaliasIdResult = await prisma.$executeRaw`UPDATE anomalias SET id = TRIM(id) WHERE id != TRIM(id)`;
    const anomaliasEquipResult = await prisma.$executeRaw`UPDATE anomalias SET equipamento_id = TRIM(equipamento_id) WHERE equipamento_id IS NOT NULL AND equipamento_id != TRIM(equipamento_id)`;
    console.log(`   ✅ ${anomaliasIdResult} anomalias.id atualizadas`);
    console.log(`   ✅ ${anomaliasEquipResult} anomalias.equipamento_id atualizadas\n`);

    // Planos de Manutenção
    console.log('📅 Limpando IDs de planos de manutenção...');
    const planosResult = await prisma.$executeRaw`UPDATE planos_manutencao SET id = TRIM(id) WHERE id != TRIM(id)`;
    console.log(`   ✅ ${planosResult} planos_manutencao.id atualizados\n`);

    // Usuários
    console.log('👤 Limpando IDs de usuários...');
    const usuariosResult = await prisma.$executeRaw`UPDATE usuarios SET id = TRIM(id) WHERE id != TRIM(id)`;
    console.log(`   ✅ ${usuariosResult} usuarios.id atualizados\n`);

    console.log('✨ Limpeza concluída com sucesso!');

  } catch (error) {
    console.error('❌ Erro durante a limpeza:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
