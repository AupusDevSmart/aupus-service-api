/**
 * Script para testar cálculo de custos de energia - HOJE
 *
 * Uso: node testar-custos-hoje.js <equipamento_id>
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testarCalculoCustosHoje(equipamentoId) {
  console.log('\n🧮 TESTE DE CÁLCULO DE CUSTOS DE ENERGIA - DETALHADO\n');
  console.log('='.repeat(80));

  // Data de hoje
  const hoje = new Date();
  const dataInicio = new Date(hoje);
  dataInicio.setHours(0, 0, 0, 0);

  const dataFim = new Date(hoje);
  dataFim.setHours(23, 59, 59, 999);

  console.log(`\n📅 Data/Hora Atual: ${hoje.toLocaleString('pt-BR')}`);
  console.log(`📅 Período de Análise: ${dataInicio.toLocaleString('pt-BR')} até ${dataFim.toLocaleString('pt-BR')}\n`);

  // 1. Buscar equipamento
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
    console.log('❌ Equipamento não encontrado');
    console.log(`   ID buscado: "${equipamentoId}"`);
    return;
  }

  console.log(`📊 DADOS DO EQUIPAMENTO:\n`);
  console.log(`   Nome: ${equipamento.nome}`);
  console.log(`   ID: ${equipamento.id}`);
  console.log(`   Tipo: ${equipamento.tipo_equipamento}`);
  console.log(`   Tag: ${equipamento.tag || 'N/A'}`);
  console.log('');

  console.log(`🏢 DADOS DA UNIDADE:\n`);
  console.log(`   Nome: ${equipamento.unidade?.nome || 'N/A'}`);
  console.log(`   ID: ${equipamento.unidade?.id || 'N/A'}`);
  console.log(`   Grupo Tarifário: ${equipamento.unidade?.grupo || 'N/A'}`);
  console.log(`   Subgrupo: ${equipamento.unidade?.subgrupo || 'N/A'}`);
  console.log(`   Irrigante: ${equipamento.unidade?.irrigante ? 'SIM ✅' : 'NÃO'}`);

  if (equipamento.unidade?.demanda_carga) {
    console.log(`   Demanda Contratada: ${equipamento.unidade.demanda_carga} kW`);
  } else {
    console.log(`   Demanda Contratada: Não configurada`);
  }

  console.log('');

  // 2. Verificar concessionária e tarifas
  const concessionaria = equipamento.unidade?.concessionaria;
  if (!concessionaria) {
    console.log('❌ Concessionária não configurada para esta unidade');
    return;
  }

  console.log(`⚡ CONCESSIONÁRIA:\n`);
  console.log(`   Nome: ${concessionaria.nome}`);
  console.log(`   ID: ${concessionaria.id}`);
  console.log('');

  // Mostrar tarifas
  const grupo = equipamento.unidade.grupo || 'B';
  console.log(`💰 TARIFAS APLICÁVEIS (Grupo ${grupo}):\n`);

  if (grupo === 'A') {
    const subgrupo = (equipamento.unidade.subgrupo || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    console.log(`   Subgrupo detectado: "${subgrupo}" (original: "${equipamento.unidade.subgrupo}")\n`);

    if (subgrupo === 'a3a' || subgrupo.includes('a3a')) {
      console.log('   📋 Tarifas A3a Verde:\n');
      console.log(`      PONTA (18:00-21:00):`);
      console.log(`        TUSD = R$ ${parseFloat(concessionaria.a3a_verde_tusd_p || 0).toFixed(6)}/kWh`);
      console.log(`        TE   = R$ ${parseFloat(concessionaria.a3a_verde_te_p || 0).toFixed(6)}/kWh`);
      console.log(`        TOTAL = R$ ${(parseFloat(concessionaria.a3a_verde_tusd_p || 0) + parseFloat(concessionaria.a3a_verde_te_p || 0)).toFixed(6)}/kWh\n`);

      console.log(`      FORA PONTA (demais horários):`);
      console.log(`        TUSD = R$ ${parseFloat(concessionaria.a3a_verde_tusd_fp || 0).toFixed(6)}/kWh`);
      console.log(`        TE   = R$ ${parseFloat(concessionaria.a3a_verde_te_fp || 0).toFixed(6)}/kWh`);
      console.log(`        TOTAL = R$ ${(parseFloat(concessionaria.a3a_verde_tusd_fp || 0) + parseFloat(concessionaria.a3a_verde_te_fp || 0)).toFixed(6)}/kWh\n`);

      console.log(`      DEMANDA:`);
      console.log(`        TUSD = R$ ${parseFloat(concessionaria.a3a_verde_tusd_d || 0).toFixed(2)}/kW/mês\n`);
    } else if (subgrupo === 'a4' || subgrupo.includes('a4')) {
      console.log('   📋 Tarifas A4 Verde:\n');
      console.log(`      PONTA (18:00-21:00):`);
      console.log(`        TUSD = R$ ${parseFloat(concessionaria.a4_verde_tusd_p || 0).toFixed(6)}/kWh`);
      console.log(`        TE   = R$ ${parseFloat(concessionaria.a4_verde_te_p || 0).toFixed(6)}/kWh`);
      console.log(`        TOTAL = R$ ${(parseFloat(concessionaria.a4_verde_tusd_p || 0) + parseFloat(concessionaria.a4_verde_te_p || 0)).toFixed(6)}/kWh\n`);

      console.log(`      FORA PONTA (demais horários):`);
      console.log(`        TUSD = R$ ${parseFloat(concessionaria.a4_verde_tusd_fp || 0).toFixed(6)}/kWh`);
      console.log(`        TE   = R$ ${parseFloat(concessionaria.a4_verde_te_fp || 0).toFixed(6)}/kWh`);
      console.log(`        TOTAL = R$ ${(parseFloat(concessionaria.a4_verde_tusd_fp || 0) + parseFloat(concessionaria.a4_verde_te_fp || 0)).toFixed(6)}/kWh\n`);

      console.log(`      DEMANDA:`);
      console.log(`        TUSD = R$ ${parseFloat(concessionaria.a4_verde_tusd_d || 0).toFixed(2)}/kW/mês\n`);
    } else {
      console.log(`   ⚠️  Subgrupo "${equipamento.unidade.subgrupo}" não reconhecido (a3a ou a4)\n`);
      console.log(`   Usando valores padrão A4:\n`);
      console.log(`      PONTA: TUSD = R$ ${parseFloat(concessionaria.a4_verde_tusd_p || 0).toFixed(6)}/kWh | TE = R$ ${parseFloat(concessionaria.a4_verde_te_p || 0).toFixed(6)}/kWh`);
      console.log(`      FORA PONTA: TUSD = R$ ${parseFloat(concessionaria.a4_verde_tusd_fp || 0).toFixed(6)}/kWh | TE = R$ ${parseFloat(concessionaria.a4_verde_te_fp || 0).toFixed(6)}/kWh\n`);
    }
  } else {
    console.log('   📋 Tarifas Grupo B:\n');
    const tusd = parseFloat(concessionaria.b_tusd_valor || 0);
    const te = parseFloat(concessionaria.b_te_valor || 0);
    console.log(`      TUSD = R$ ${tusd.toFixed(6)}/kWh`);
    console.log(`      TE   = R$ ${te.toFixed(6)}/kWh`);
    console.log(`      TOTAL = R$ ${(tusd + te).toFixed(6)}/kWh\n`);
  }

  // 3. Buscar TODAS as leituras (incluindo qualidade ruim) para análise
  const todasLeituras = await prisma.equipamentos_dados.findMany({
    where: {
      equipamento_id: equipamentoId.trim(),
      timestamp_dados: {
        gte: dataInicio,
        lte: dataFim
      }
    },
    orderBy: {
      timestamp_dados: 'asc'
    }
  });

  console.log(`📊 ANÁLISE DE LEITURAS:\n`);
  console.log(`   Total de registros no período: ${todasLeituras.length}`);

  const comEnergia = todasLeituras.filter(l => l.energia_kwh !== null && l.energia_kwh !== undefined);
  const semEnergia = todasLeituras.filter(l => l.energia_kwh === null || l.energia_kwh === undefined);
  const qualidadeBoa = todasLeituras.filter(l => l.qualidade === 'bom');
  const qualidadeRuim = todasLeituras.filter(l => l.qualidade === 'ruim');
  const qualidadeOutras = todasLeituras.filter(l => l.qualidade !== 'bom' && l.qualidade !== 'ruim');

  console.log(`   Com energia_kwh preenchido: ${comEnergia.length}`);
  console.log(`   Sem energia_kwh (NULL): ${semEnergia.length}`);
  console.log(`   Qualidade "bom": ${qualidadeBoa.length}`);
  console.log(`   Qualidade "ruim": ${qualidadeRuim.length}`);
  console.log(`   Outras qualidades: ${qualidadeOutras.length}`);
  console.log('');

  // Leituras válidas para cálculo de custos
  const leiturasValidas = await prisma.equipamentos_dados.findMany({
    where: {
      equipamento_id: equipamentoId.trim(),
      timestamp_dados: {
        gte: dataInicio,
        lte: dataFim
      },
      energia_kwh: {
        not: null
      },
      qualidade: {
        in: ['OK', 'SUSPEITO', 'bom'] // Aceitar tanto minúsculo quanto maiúsculo
      }
    },
    orderBy: {
      timestamp_dados: 'asc'
    }
  });

  console.log(`✅ LEITURAS VÁLIDAS PARA CÁLCULO (energia_kwh != NULL e qualidade boa):\n`);
  console.log(`   Total: ${leiturasValidas.length} leituras\n`);

  if (leiturasValidas.length === 0) {
    console.log('⚠️  NENHUMA LEITURA VÁLIDA ENCONTRADA!\n');
    console.log('   Motivos possíveis:');
    console.log('   1. Todas as leituras têm energia_kwh = NULL (dados antigos antes da correção)');
    console.log('   2. Todas as leituras têm qualidade = "ruim"');
    console.log('   3. Não há leituras no período especificado\n');

    if (comEnergia.length > 0 && qualidadeRuim.length > 0) {
      console.log('   💡 SOLUÇÃO: Há leituras com energia_kwh mas qualidade "ruim"');
      console.log('   Para fins de teste, vou calcular com essas leituras também...\n');

      // Usar leituras com energia, independente da qualidade
      const leiturasParaTeste = todasLeituras.filter(l => l.energia_kwh !== null && l.energia_kwh !== undefined);
      await calcularCustos(leiturasParaTeste, equipamento, concessionaria, grupo);
    }

    return;
  }

  // Mostrar primeiras e últimas leituras
  if (leiturasValidas.length > 0) {
    console.log(`   📌 Primeira leitura: ${leiturasValidas[0].timestamp_dados.toLocaleString('pt-BR')}`);
    console.log(`      Energia: ${parseFloat(leiturasValidas[0].energia_kwh).toFixed(10)} kWh`);
    console.log(`      Potência: ${leiturasValidas[0].potencia_ativa_kw ? parseFloat(leiturasValidas[0].potencia_ativa_kw).toFixed(6) : 'N/A'} kW\n`);

    const ultima = leiturasValidas[leiturasValidas.length - 1];
    console.log(`   📌 Última leitura: ${ultima.timestamp_dados.toLocaleString('pt-BR')}`);
    console.log(`      Energia: ${parseFloat(ultima.energia_kwh).toFixed(10)} kWh`);
    console.log(`      Potência: ${ultima.potencia_ativa_kw ? parseFloat(ultima.potencia_ativa_kw).toFixed(6) : 'N/A'} kW\n`);
  }

  // Calcular custos
  await calcularCustos(leiturasValidas, equipamento, concessionaria, grupo);
}

async function calcularCustos(leituras, equipamento, concessionaria, grupo) {
  // 4. Classificar leituras por horário
  const classificacao = {
    PONTA: [],
    FORA_PONTA: [],
    RESERVADO: [],
    IRRIGANTE: []
  };

  let detalhePorHora = {};

  leituras.forEach(leitura => {
    const hora = leitura.timestamp_dados.getHours();
    const minuto = leitura.timestamp_dados.getMinutes();

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

    // Acumular por hora
    if (!detalhePorHora[hora]) {
      detalhePorHora[hora] = { count: 0, energia: 0, tipo: tipo };
    }
    detalhePorHora[hora].count++;
    detalhePorHora[hora].energia += parseFloat(leitura.energia_kwh || 0);
  });

  console.log('🕐 CLASSIFICAÇÃO POR HORÁRIO:\n');
  console.log(`   PONTA (18:00-21:00):                     ${classificacao.PONTA.length} leituras`);
  console.log(`   FORA PONTA (demais horários):            ${classificacao.FORA_PONTA.length} leituras`);
  console.log(`   RESERVADO (21:30-06:00, sem irrigação):  ${classificacao.RESERVADO.length} leituras`);
  console.log(`   IRRIGANTE (21:30-06:00, com desconto):   ${classificacao.IRRIGANTE.length} leituras`);
  console.log('');

  // Mostrar distribuição por hora
  console.log('📊 DISTRIBUIÇÃO POR HORA DO DIA:\n');
  console.log('   Hora | Leituras | Energia (kWh)     | Tipo');
  console.log('   -----|----------|-------------------|------------------');

  for (let h = 0; h < 24; h++) {
    if (detalhePorHora[h]) {
      const hora = String(h).padStart(2, '0');
      const count = String(detalhePorHora[h].count).padStart(8, ' ');
      const energia = detalhePorHora[h].energia.toFixed(10).padStart(17, ' ');
      const tipo = detalhePorHora[h].tipo;
      console.log(`   ${hora}h  |${count}  | ${energia} | ${tipo}`);
    }
  }
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

  console.log('⚡ ENERGIA CONSUMIDA:\n');
  console.log(`   PONTA:      ${agregacao.ponta.toFixed(9)} kWh`);
  console.log(`   FORA PONTA: ${agregacao.fora_ponta.toFixed(9)} kWh`);
  console.log(`   RESERVADO:  ${agregacao.reservado.toFixed(9)} kWh`);

  if (equipamento.unidade.irrigante) {
    console.log(`   IRRIGANTE:  ${agregacao.irrigante.toFixed(9)} kWh (com desconto 80% no TE) ✅`);
  } else {
    console.log(`   IRRIGANTE:  ${agregacao.irrigante.toFixed(9)} kWh`);
  }

  console.log(`   ${'─'.repeat(40)}`);
  console.log(`   TOTAL:      ${agregacao.total.toFixed(9)} kWh`);
  console.log('');
  console.log(`   📊 Demanda máxima: ${potenciaMaxima.toFixed(6)} kW`);
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

  let tarifas = {};

  if (grupo === 'A') {
    const subgrupo = (equipamento.unidade.subgrupo || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    if (subgrupo.includes('a3a')) {
      tarifas = {
        tusd_p: parseFloat(concessionaria.a3a_verde_tusd_p || 0),
        te_p: parseFloat(concessionaria.a3a_verde_te_p || 0),
        tusd_fp: parseFloat(concessionaria.a3a_verde_tusd_fp || 0),
        te_fp: parseFloat(concessionaria.a3a_verde_te_fp || 0),
        tusd_d: parseFloat(concessionaria.a3a_verde_tusd_d || 0)
      };
    } else {
      // Default para A4
      tarifas = {
        tusd_p: parseFloat(concessionaria.a4_verde_tusd_p || 0),
        te_p: parseFloat(concessionaria.a4_verde_te_p || 0),
        tusd_fp: parseFloat(concessionaria.a4_verde_tusd_fp || 0),
        te_fp: parseFloat(concessionaria.a4_verde_te_fp || 0),
        tusd_d: parseFloat(concessionaria.a4_verde_tusd_d || 0)
      };
    }

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
  } else {
    // Grupo B
    const tusd_b = parseFloat(concessionaria.b_tusd_valor || 0);
    const te_b = parseFloat(concessionaria.b_te_valor || 0);
    const tarifa_b = tusd_b + te_b;

    tarifas = { tusd_b, te_b, tarifa_total: tarifa_b };

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
    const tarifa = tarifas.tusd_p + tarifas.te_p;
    console.log(`   PONTA:      R$ ${custos.ponta.toFixed(8)} (${agregacao.ponta.toFixed(9)} kWh × R$ ${tarifa.toFixed(6)}/kWh)`);
  }
  if (custos.fora_ponta > 0) {
    const tarifa = grupo === 'A' ? (tarifas.tusd_fp + tarifas.te_fp) : tarifas.tarifa_total;
    console.log(`   FORA PONTA: R$ ${custos.fora_ponta.toFixed(8)} (${(agregacao.total - agregacao.irrigante - agregacao.ponta - agregacao.reservado).toFixed(9)} kWh × R$ ${tarifa.toFixed(6)}/kWh)`);
  }
  if (custos.reservado > 0) {
    const tarifa = tarifas.tusd_fp + tarifas.te_fp;
    console.log(`   RESERVADO:  R$ ${custos.reservado.toFixed(8)} (${agregacao.reservado.toFixed(9)} kWh × R$ ${tarifa.toFixed(6)}/kWh)`);
  }
  if (custos.irrigante > 0) {
    const tusd = grupo === 'A' ? tarifas.tusd_fp : tarifas.tusd_b;
    const te_desc = grupo === 'A' ? (tarifas.te_fp * 0.20) : (tarifas.te_b * 0.20);
    const tarifa = tusd + te_desc;
    console.log(`   IRRIGANTE:  R$ ${custos.irrigante.toFixed(8)} (${agregacao.irrigante.toFixed(9)} kWh × R$ ${tarifa.toFixed(6)}/kWh) ✅`);
  }
  if (custos.demanda > 0) {
    console.log(`   DEMANDA:    R$ ${custos.demanda.toFixed(4)} (${equipamento.unidade.demanda_carga} kW × R$ ${tarifas.tusd_d.toFixed(4)}/kW) ⚠️ MENSAL`);
  }

  console.log(`   ${'─'.repeat(70)}`);
  console.log(`   TOTAL:      R$ ${custos.total.toFixed(8)}`);

  if (custos.economia_irrigante > 0) {
    console.log(`\n   💰 ECONOMIA COM DESCONTO IRRIGANTE: R$ ${custos.economia_irrigante.toFixed(8)}`);
    const percentual = (custos.economia_irrigante / (custos.irrigante + custos.economia_irrigante)) * 100;
    console.log(`      (${percentual.toFixed(2)}% de desconto no período irrigante)`);
  }

  if (agregacao.total > 0) {
    const custoMedioKwh = custos.total / agregacao.total;
    console.log(`\n   📊 CUSTO MÉDIO: R$ ${custoMedioKwh.toFixed(8)}/kWh`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Teste concluído!\n');
}

// Execução
const equipamentoId = process.argv[2];

if (!equipamentoId) {
  console.log('\n❌ Uso: node testar-custos-hoje.js <equipamento_id>');
  console.log('Exemplo: node testar-custos-hoje.js cmhnk06ka009l2fbkd1o2tyua\n');
  process.exit(1);
}

testarCalculoCustosHoje(equipamentoId)
  .catch(console.error)
  .finally(() => prisma.$disconnect());
