/**
 * Script de debug para verificar o que está acontecendo no cálculo de custos
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugCustos(equipamentoId) {
  console.log('\n🔍 DEBUG - CÁLCULO DE CUSTOS NO BACKEND\n');
  console.log('='.repeat(80));

  const hoje = new Date();
  const dataInicio = new Date(hoje);
  dataInicio.setHours(0, 0, 0, 0);
  const dataFim = new Date(hoje);
  dataFim.setHours(23, 59, 59, 999);

  console.log(`\nData: ${hoje.toLocaleDateString('pt-BR')}`);
  console.log(`Equipamento: ${equipamentoId}\n`);

  // 1. Buscar equipamento com unidade e concessionária
  const equipamento = await prisma.equipamentos.findUnique({
    where: { id: equipamentoId.trim() },
    include: {
      unidade: {
        include: {
          concessionaria: true
        }
      }
    }
  });

  if (!equipamento) {
    console.log('❌ Equipamento não encontrado\n');
    return;
  }

  console.log('📊 EQUIPAMENTO:');
  console.log(`   Nome: ${equipamento.nome}`);
  console.log(`   Tipo: ${equipamento.tipo_equipamento}\n`);

  console.log('🏢 UNIDADE:');
  console.log(`   Nome: ${equipamento.unidade?.nome || 'N/A'}`);
  console.log(`   Grupo: ${equipamento.unidade?.grupo || 'N/A'}`);
  console.log(`   Subgrupo: ${equipamento.unidade?.subgrupo || 'N/A'}`);
  console.log(`   Irrigante: ${equipamento.unidade?.irrigante ? 'SIM' : 'NÃO'}\n`);

  // 2. Verificar tarifas
  const concessionaria = equipamento.unidade?.concessionaria;
  if (!concessionaria) {
    console.log('❌ Concessionária não configurada\n');
    return;
  }

  console.log('⚡ CONCESSIONÁRIA:');
  console.log(`   Nome: ${concessionaria.nome}\n`);

  const grupo = equipamento.unidade.grupo || 'B';
  const subgrupo = (equipamento.unidade.subgrupo || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  console.log('💰 TARIFAS:');
  if (grupo === 'A') {
    if (subgrupo.includes('a4')) {
      console.log(`   A4 PONTA - TUSD: ${concessionaria.a4_verde_tusd_p || 0} | TE: ${concessionaria.a4_verde_te_p || 0}`);
      console.log(`   A4 FP - TUSD: ${concessionaria.a4_verde_tusd_fp || 0} | TE: ${concessionaria.a4_verde_te_fp || 0}`);
      console.log(`   A4 Demanda: ${concessionaria.a4_verde_tusd_d || 0}\n`);

      const tarifaP = parseFloat(concessionaria.a4_verde_tusd_p || 0) + parseFloat(concessionaria.a4_verde_te_p || 0);
      const tarifaFP = parseFloat(concessionaria.a4_verde_tusd_fp || 0) + parseFloat(concessionaria.a4_verde_te_fp || 0);

      console.log(`   ✅ TARIFA PONTA TOTAL: R$ ${tarifaP}/kWh`);
      console.log(`   ✅ TARIFA FP TOTAL: R$ ${tarifaFP}/kWh\n`);

      if (tarifaP === 0 || tarifaFP === 0) {
        console.log('   ⚠️  ATENÇÃO: Tarifas estão ZERADAS!\n');
      }
    }
  } else {
    console.log(`   B - TUSD: ${concessionaria.b_tusd_valor || 0} | TE: ${concessionaria.b_te_valor || 0}\n`);

    const tarifaB = parseFloat(concessionaria.b_tusd_valor || 0) + parseFloat(concessionaria.b_te_valor || 0);
    console.log(`   ✅ TARIFA TOTAL: R$ ${tarifaB}/kWh\n`);

    if (tarifaB === 0) {
      console.log('   ⚠️  ATENÇÃO: Tarifa está ZERADA!\n');
    }
  }

  // 3. Buscar leituras (SIMULANDO O QUE O SERVIÇO FAZ)
  console.log('📈 LEITURAS (filtro do serviço de custos):');

  // Primeiro: COM filtro de qualidade (como estava antes)
  const leiturasComFiltro = await prisma.equipamentos_dados.findMany({
    where: {
      equipamento_id: equipamentoId.trim(),
      timestamp_dados: { gte: dataInicio, lte: dataFim },
      energia_kwh: { not: null },
      qualidade: { in: ['OK', 'SUSPEITO', 'bom'] }
    }
  });

  console.log(`   Com filtro de qualidade: ${leiturasComFiltro.length} leituras`);

  // Segundo: SEM filtro de qualidade (correção aplicada)
  const leiturasSemFiltro = await prisma.equipamentos_dados.findMany({
    where: {
      equipamento_id: equipamentoId.trim(),
      timestamp_dados: { gte: dataInicio, lte: dataFim },
      energia_kwh: { not: null }
    }
  });

  console.log(`   Sem filtro de qualidade: ${leiturasSemFiltro.length} leituras\n`);

  if (leiturasSemFiltro.length === 0) {
    console.log('   ❌ NENHUMA LEITURA COM energia_kwh != NULL\n');
    console.log('   Isso significa que os dados ainda não foram salvos com os novos campos.\n');
    return;
  }

  // 4. Calcular energia total
  const energiaTotal = leiturasSemFiltro.reduce((sum, l) => {
    return sum + parseFloat(l.energia_kwh || 0);
  }, 0);

  console.log(`📊 ENERGIA TOTAL: ${energiaTotal.toFixed(9)} kWh\n`);

  // 5. Simular cálculo de custo (FP)
  if (grupo === 'A') {
    const tarifaFP = parseFloat(concessionaria.a4_verde_tusd_fp || 0) + parseFloat(concessionaria.a4_verde_te_fp || 0);
    const custoFP = energiaTotal * tarifaFP;

    console.log('💵 SIMULAÇÃO DE CUSTO:');
    console.log(`   Energia FP: ${energiaTotal.toFixed(9)} kWh`);
    console.log(`   Tarifa FP: R$ ${tarifaFP}/kWh`);
    console.log(`   Custo = ${energiaTotal.toFixed(9)} × ${tarifaFP}`);
    console.log(`   ✅ CUSTO FP: R$ ${custoFP.toFixed(8)}\n`);
  } else {
    const tarifaB = parseFloat(concessionaria.b_tusd_valor || 0) + parseFloat(concessionaria.b_te_valor || 0);
    const custoB = energiaTotal * tarifaB;

    console.log('💵 SIMULAÇÃO DE CUSTO:');
    console.log(`   Energia: ${energiaTotal.toFixed(9)} kWh`);
    console.log(`   Tarifa B: R$ ${tarifaB}/kWh`);
    console.log(`   Custo = ${energiaTotal.toFixed(9)} × ${tarifaB}`);
    console.log(`   ✅ CUSTO: R$ ${custoB.toFixed(8)}\n`);
  }

  console.log('='.repeat(80));
  console.log('\n🔍 DIAGNÓSTICO:\n');

  if (leiturasComFiltro.length === 0 && leiturasSemFiltro.length > 0) {
    console.log('⚠️  PROBLEMA: Filtro de qualidade está excluindo todas as leituras!');
    console.log('   SOLUÇÃO: Backend precisa ser reiniciado com a correção aplicada.\n');
  } else if (leiturasSemFiltro.length === 0) {
    console.log('⚠️  PROBLEMA: Nenhuma leitura tem energia_kwh preenchido!');
    console.log('   SOLUÇÃO: Aguardar novas mensagens MQTT chegarem.\n');
  } else {
    const tarifaFP = parseFloat(concessionaria.a4_verde_tusd_fp || 0) + parseFloat(concessionaria.a4_verde_te_fp || 0);
    if (tarifaFP === 0) {
      console.log('⚠️  PROBLEMA: Tarifas estão zeradas na concessionária!');
      console.log('   SOLUÇÃO: Cadastrar tarifas corretas na concessionária.\n');
    } else {
      console.log('✅ Tudo parece correto! Se ainda aparece R$ 0,00:');
      console.log('   1. Backend pode não ter sido reiniciado');
      console.log('   2. Ou cache do frontend precisa ser limpo (Ctrl+Shift+R)\n');
    }
  }

  console.log('='.repeat(80) + '\n');
}

const equipamentoId = process.argv[2] || 'cmhnk06ka009l2fbkd1o2tyua';
debugCustos(equipamentoId)
  .catch(console.error)
  .finally(() => prisma.$disconnect());
