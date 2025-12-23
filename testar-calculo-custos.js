/**
 * Script para testar cálculo de custos de energia
 *
 * Uso: node testar-calculo-custos.js <equipamento_id> [data]
 * Exemplo: node testar-calculo-custos.js cmhnk06ka009l2fbkd1o2tyua 2025-12-23
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testarCalculoCustos(equipamentoId, dataStr) {
  console.log('\n🧮 TESTE DE CÁLCULO DE CUSTOS DE ENERGIA\n');
  console.log('='.repeat(80));

  // Parse da data
  const data = dataStr ? new Date(dataStr) : new Date();
  const dataInicio = new Date(data);
  dataInicio.setHours(0, 0, 0, 0);

  const dataFim = new Date(data);
  dataFim.setHours(23, 59, 59, 999);

  console.log(`\n📅 Período: ${dataInicio.toLocaleDateString('pt-BR')} 00:00 até 23:59\n`);

  // 1. Buscar equipamento
  const equipamento = await prisma.equipamentos.findUnique({
    where: { id: equipamentoId },
    include: {
      unidade: {
        include: {
          concessionaria: true
        }
      }
    }
  });

  if (!equipamento) {
    console.log('❌ Equipamento não encontrado');
    return;
  }

  console.log(`📊 Equipamento: ${equipamento.nome}`);
  console.log(`   Unidade: ${equipamento.unidade?.nome || 'N/A'}`);
  console.log(`   Grupo: ${equipamento.unidade?.grupo || 'N/A'}`);
  console.log(`   Subgrupo: ${equipamento.unidade?.subgrupo || 'N/A'}`);
  console.log(`   Irrigante: ${equipamento.unidade?.irrigante ? 'SIM ✅' : 'NÃO'}`);

  if (equipamento.unidade?.demanda_carga) {
    console.log(`   Demanda Contratada: ${equipamento.unidade.demanda_carga} kW`);
  }

  console.log('');

  // 2. Verificar concessionária e tarifas
  const concessionaria = equipamento.unidade?.concessionaria;
  if (!concessionaria) {
    console.log('❌ Concessionária não configurada para esta unidade');
    return;
  }

  console.log(`⚡ Concessionária: ${concessionaria.nome}`);
  console.log('');

  // Mostrar tarifas
  const grupo = equipamento.unidade.grupo || 'B';
  console.log(`💰 Tarifas aplicáveis (Grupo ${grupo}):\n`);

  if (grupo === 'A') {
    const subgrupo = (equipamento.unidade.subgrupo || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    if (subgrupo === 'a3a') {
      console.log('   📋 Tarifas A3a Verde:');
      console.log(`      PONTA:      TUSD = R$ ${concessionaria.a3a_verde_tusd_p || 0}/kWh | TE = R$ ${concessionaria.a3a_verde_te_p || 0}/kWh`);
      console.log(`      FORA PONTA: TUSD = R$ ${concessionaria.a3a_verde_tusd_fp || 0}/kWh | TE = R$ ${concessionaria.a3a_verde_te_fp || 0}/kWh`);
      console.log(`      DEMANDA:    TUSD = R$ ${concessionaria.a3a_verde_tusd_d || 0}/kW/mês`);
    } else if (subgrupo === 'a4') {
      console.log('   📋 Tarifas A4 Verde:');
      console.log(`      PONTA:      TUSD = R$ ${concessionaria.a4_verde_tusd_p || 0}/kWh | TE = R$ ${concessionaria.a4_verde_te_p || 0}/kWh`);
      console.log(`      FORA PONTA: TUSD = R$ ${concessionaria.a4_verde_tusd_fp || 0}/kWh | TE = R$ ${concessionaria.a4_verde_te_fp || 0}/kWh`);
      console.log(`      DEMANDA:    TUSD = R$ ${concessionaria.a4_verde_tusd_d || 0}/kW/mês`);
    } else {
      console.log(`   ⚠️  Subgrupo "${equipamento.unidade.subgrupo}" não reconhecido`);
    }
  } else {
    console.log('   📋 Tarifas Grupo B:');
    console.log(`      TUSD = R$ ${concessionaria.b_tusd_valor || 0}/kWh`);
    console.log(`      TE   = R$ ${concessionaria.b_te_valor || 0}/kWh`);
    console.log(`      TOTAL = R$ ${parseFloat(concessionaria.b_tusd_valor || 0) + parseFloat(concessionaria.b_te_valor || 0)}/kWh`);
  }

  console.log('');

  // 3. Buscar leituras do período
  const leituras = await prisma.equipamentos_dados.findMany({
    where: {
      equipamento_id: equipamentoId,
      timestamp_dados: {
        gte: dataInicio,
        lte: dataFim
      },
      energia_kwh: {
        not: null
      }
    },
    orderBy: {
      timestamp_dados: 'asc'
    }
  });

  console.log(`📈 Leituras encontradas: ${leituras.length}\n`);

  if (leituras.length === 0) {
    console.log('⚠️  Nenhuma leitura encontrada no período');
    console.log('   Verifique se:');
    console.log('   - O equipamento está recebendo dados MQTT');
    console.log('   - O campo energia_kwh está sendo preenchido');
    console.log('   - A data está correta');
    return;
  }

  // 4. Classificar leituras por horário
  const classificacao = {
    PONTA: [],
    FORA_PONTA: [],
    RESERVADO: [],
    IRRIGANTE: []
  };

  leituras.forEach(leitura => {
    const hora = leitura.timestamp_dados.getHours();
    const minuto = leitura.timestamp_dados.getMinutes();
    const totalMinutos = hora * 60 + minuto;

    // Classificação horária brasileira
    const isPonta = hora >= 18 && hora < 21; // 18:00-21:00
    const isReservado = (hora >= 21 && (minuto >= 30 || hora > 21)) || hora < 6; // 21:30-06:00

    let tipo;

    if (equipamento.unidade.irrigante && isReservado) {
      tipo = 'IRRIGANTE';
    } else if (isPonta) {
      tipo = 'PONTA';
    } else if (isReservado && grupo === 'A') {
      tipo = 'RESERVADO';
    } else {
      tipo = 'FORA_PONTA';
    }

    classificacao[tipo].push(leitura);
  });

  console.log('🕐 Classificação por horário:\n');
  console.log(`   PONTA (18:00-21:00):         ${classificacao.PONTA.length} leituras`);
  console.log(`   FORA PONTA (demais):         ${classificacao.FORA_PONTA.length} leituras`);
  console.log(`   RESERVADO (21:30-06:00):     ${classificacao.RESERVADO.length} leituras`);
  console.log(`   IRRIGANTE (21:30-06:00 c/ desconto): ${classificacao.IRRIGANTE.length} leituras`);
  console.log('');

  // 5. Calcular energia por tipo
  const agregacao = {
    ponta: 0,
    fora_ponta: 0,
    reservado: 0,
    irrigante: 0,
    total: 0
  };

  let potenciaMaxima = 0;

  Object.keys(classificacao).forEach(tipo => {
    const energiaTotal = classificacao[tipo].reduce((sum, l) => {
      const energia = parseFloat(l.energia_kwh || 0);
      const potencia = parseFloat(l.potencia_ativa_kw || 0);

      if (potencia > potenciaMaxima) {
        potenciaMaxima = potencia;
      }

      return sum + energia;
    }, 0);

    agregacao[tipo.toLowerCase()] = energiaTotal;
    agregacao.total += energiaTotal;
  });

  console.log('⚡ Energia consumida:\n');
  console.log(`   PONTA:      ${agregacao.ponta.toFixed(3)} kWh`);
  console.log(`   FORA PONTA: ${agregacao.fora_ponta.toFixed(3)} kWh`);
  console.log(`   RESERVADO:  ${agregacao.reservado.toFixed(3)} kWh`);
  console.log(`   IRRIGANTE:  ${agregacao.irrigante.toFixed(3)} kWh ${equipamento.unidade.irrigante ? '(com desconto 80% no TE)' : ''}`);
  console.log(`   ─────────────────────────────`);
  console.log(`   TOTAL:      ${agregacao.total.toFixed(3)} kWh`);
  console.log('');
  console.log(`   📊 Demanda máxima: ${potenciaMaxima.toFixed(2)} kW`);
  console.log('');

  // 6. Calcular custos
  let custos = {
    ponta: 0,
    fora_ponta: 0,
    reservado: 0,
    irrigante: 0,
    demanda: 0,
    total: 0,
    economia_irrigante: 0
  };

  if (grupo === 'A') {
    const subgrupo = (equipamento.unidade.subgrupo || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let tarifas;

    if (subgrupo === 'a3a') {
      tarifas = {
        tusd_p: parseFloat(concessionaria.a3a_verde_tusd_p || 0),
        te_p: parseFloat(concessionaria.a3a_verde_te_p || 0),
        tusd_fp: parseFloat(concessionaria.a3a_verde_tusd_fp || 0),
        te_fp: parseFloat(concessionaria.a3a_verde_te_fp || 0),
        tusd_d: parseFloat(concessionaria.a3a_verde_tusd_d || 0)
      };
    } else if (subgrupo === 'a4') {
      tarifas = {
        tusd_p: parseFloat(concessionaria.a4_verde_tusd_p || 0),
        te_p: parseFloat(concessionaria.a4_verde_te_p || 0),
        tusd_fp: parseFloat(concessionaria.a4_verde_tusd_fp || 0),
        te_fp: parseFloat(concessionaria.a4_verde_te_fp || 0),
        tusd_d: parseFloat(concessionaria.a4_verde_tusd_d || 0)
      };
    }

    if (tarifas) {
      const tarifa_ponta = tarifas.tusd_p + tarifas.te_p;
      const tarifa_fp = tarifas.tusd_fp + tarifas.te_fp;

      custos.ponta = agregacao.ponta * tarifa_ponta;
      custos.fora_ponta = agregacao.fora_ponta * tarifa_fp;
      custos.reservado = agregacao.reservado * tarifa_fp;

      // Irrigante com desconto
      if (agregacao.irrigante > 0) {
        const te_com_desconto = tarifas.te_fp * 0.20; // 80% desconto
        const tarifa_irrigante = tarifas.tusd_fp + te_com_desconto;
        custos.irrigante = agregacao.irrigante * tarifa_irrigante;

        // Economia
        const custo_sem_desconto = agregacao.irrigante * tarifa_fp;
        custos.economia_irrigante = custo_sem_desconto - custos.irrigante;
      }

      // Demanda
      if (equipamento.unidade.demanda_carga && tarifas.tusd_d) {
        custos.demanda = parseFloat(equipamento.unidade.demanda_carga) * tarifas.tusd_d;
      }
    }
  } else {
    // Grupo B
    const tusd_b = parseFloat(concessionaria.b_tusd_valor || 0);
    const te_b = parseFloat(concessionaria.b_te_valor || 0);
    const tarifa_b = tusd_b + te_b;

    const energia_normal = agregacao.total - agregacao.irrigante;
    custos.fora_ponta = energia_normal * tarifa_b;

    // Irrigante com desconto
    if (agregacao.irrigante > 0) {
      const te_com_desconto = te_b * 0.20; // 80% desconto
      const tarifa_irrigante = tusd_b + te_com_desconto;
      custos.irrigante = agregacao.irrigante * tarifa_irrigante;

      // Economia
      const custo_sem_desconto = agregacao.irrigante * tarifa_b;
      custos.economia_irrigante = custo_sem_desconto - custos.irrigante;
    }
  }

  custos.total = custos.ponta + custos.fora_ponta + custos.reservado + custos.irrigante + custos.demanda;

  console.log('💵 CUSTOS CALCULADOS:\n');

  if (custos.ponta > 0) {
    console.log(`   PONTA:      R$ ${custos.ponta.toFixed(2)}`);
  }
  if (custos.fora_ponta > 0) {
    console.log(`   FORA PONTA: R$ ${custos.fora_ponta.toFixed(2)}`);
  }
  if (custos.reservado > 0) {
    console.log(`   RESERVADO:  R$ ${custos.reservado.toFixed(2)}`);
  }
  if (custos.irrigante > 0) {
    console.log(`   IRRIGANTE:  R$ ${custos.irrigante.toFixed(2)} (com desconto)`);
  }
  if (custos.demanda > 0) {
    console.log(`   DEMANDA:    R$ ${custos.demanda.toFixed(2)} (mensal)`);
  }

  console.log(`   ─────────────────────────────`);
  console.log(`   TOTAL:      R$ ${custos.total.toFixed(2)}`);

  if (custos.economia_irrigante > 0) {
    console.log(`\n   💰 Economia com desconto irrigante: R$ ${custos.economia_irrigante.toFixed(2)}`);
  }

  if (agregacao.total > 0) {
    const custoMedioKwh = custos.total / agregacao.total;
    console.log(`\n   📊 Custo médio: R$ ${custoMedioKwh.toFixed(4)}/kWh`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Teste concluído!\n');
}

// Execução
const equipamentoId = process.argv[2];
const data = process.argv[3];

if (!equipamentoId) {
  console.log('\n❌ Uso: node testar-calculo-custos.js <equipamento_id> [data]');
  console.log('Exemplo: node testar-calculo-custos.js cmhnk06ka009l2fbkd1o2tyua 2025-12-23\n');
  process.exit(1);
}

testarCalculoCustos(equipamentoId, data)
  .catch(console.error)
  .finally(() => prisma.$disconnect());
