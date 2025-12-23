/**
 * Script para testar Cenário C - Demanda apenas em período mensal
 *
 * Uso: node testar-cenario-c.js <equipamento_id>
 */

const http = require('http');

async function testarPeriodo(equipamentoId, periodo, data) {
  const url = periodo === 'dia'
    ? `http://localhost:3000/equipamentos-dados/${equipamentoId}/custos-energia?periodo=dia&data=${data}`
    : `http://localhost:3000/equipamentos-dados/${equipamentoId}/custos-energia?periodo=mes&data=${data}`;

  console.log(`\n📡 Testando período: ${periodo.toUpperCase()}`);
  console.log(`   URL: ${url}\n`);

  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.log(`   ❌ Status Code: ${res.statusCode}`);
          console.log(`   ${responseData}\n`);
          resolve({ erro: true });
          return;
        }

        try {
          const resultado = JSON.parse(responseData);

          console.log(`   ✅ Status: 200 OK`);
          console.log(`   📊 Período: ${resultado.periodo?.tipo}`);
          console.log(`   🏢 Unidade: ${resultado.unidade?.nome}`);
          console.log(`   📈 Energia Total: ${resultado.consumo?.energia_total_kwh} kWh`);
          console.log(`   ⚡ Demanda Máxima: ${resultado.consumo?.demanda_maxima_kw} kW`);
          console.log(`   💰 Custo Demanda: R$ ${resultado.custos?.custo_demanda}`);
          console.log(`   💵 Custo Total: R$ ${resultado.custos?.custo_total}`);

          resolve({
            periodo: resultado.periodo?.tipo,
            energia_total: resultado.consumo?.energia_total_kwh,
            demanda_maxima: resultado.consumo?.demanda_maxima_kw,
            custo_demanda: resultado.custos?.custo_demanda,
            custo_total: resultado.custos?.custo_total,
          });

        } catch (e) {
          console.log(`   ❌ Erro ao parsear JSON: ${e.message}\n`);
          resolve({ erro: true });
        }
      });
    }).on('error', (e) => {
      console.log(`   ❌ Erro na conexão: ${e.message}`);
      console.log(`   💡 Verifique se o backend está rodando em http://localhost:3000\n`);
      resolve({ erro: true });
    });
  });
}

async function executarTestes(equipamentoId) {
  console.log('\n🧪 TESTE - CENÁRIO C: DEMANDA APENAS EM PERÍODO MENSAL\n');
  console.log('='.repeat(80));
  console.log(`\nEquipamento: ${equipamentoId}`);

  const hoje = new Date();
  const dataHoje = hoje.toISOString().split('T')[0]; // YYYY-MM-DD
  const mesAtual = dataHoje.substring(0, 7); // YYYY-MM

  // Teste 1: Período DIÁRIO
  console.log('\n' + '='.repeat(80));
  console.log('TESTE 1: PERÍODO DIÁRIO (demanda NÃO deve aparecer no custo)');
  console.log('='.repeat(80));
  const resultadoDia = await testarPeriodo(equipamentoId, 'dia', dataHoje);

  // Teste 2: Período MENSAL
  console.log('\n' + '='.repeat(80));
  console.log('TESTE 2: PERÍODO MENSAL (demanda DEVE aparecer no custo)');
  console.log('='.repeat(80));
  const resultadoMes = await testarPeriodo(equipamentoId, 'mes', mesAtual);

  // Análise dos resultados
  console.log('\n' + '='.repeat(80));
  console.log('📊 ANÁLISE DOS RESULTADOS - CENÁRIO C\n');
  console.log('='.repeat(80));

  if (resultadoDia.erro || resultadoMes.erro) {
    console.log('\n❌ Testes falharam - verifique os erros acima\n');
    return;
  }

  // Verificar período diário
  console.log('\n✅ Período DIÁRIO:');
  if (resultadoDia.custo_demanda === 0) {
    console.log('   ✅ CORRETO: Custo de demanda = R$ 0.00');
    console.log('   ✅ Demanda máxima mostrada apenas como informação');
  } else {
    console.log(`   ❌ ERRO: Custo de demanda deveria ser R$ 0.00, mas está R$ ${resultadoDia.custo_demanda}`);
  }
  console.log(`   Energia: ${resultadoDia.energia_total} kWh`);
  console.log(`   Demanda Máxima: ${resultadoDia.demanda_maxima} kW (informativo)`);
  console.log(`   Custo Total: R$ ${resultadoDia.custo_total} (apenas energia)`);

  // Verificar período mensal
  console.log('\n✅ Período MENSAL:');
  if (resultadoMes.custo_demanda > 0) {
    console.log(`   ✅ CORRETO: Custo de demanda = R$ ${resultadoMes.custo_demanda}`);
    console.log('   ✅ Demanda contratada incluída no custo total');
  } else {
    console.log(`   ❌ ERRO: Custo de demanda deveria ser > R$ 0.00, mas está R$ ${resultadoMes.custo_demanda}`);
  }
  console.log(`   Energia: ${resultadoMes.energia_total} kWh`);
  console.log(`   Demanda Máxima: ${resultadoMes.demanda_maxima} kW`);
  console.log(`   Custo Total: R$ ${resultadoMes.custo_total} (energia + demanda)`);

  // Resumo final
  console.log('\n' + '='.repeat(80));
  console.log('🎯 RESUMO - CENÁRIO C\n');
  console.log('='.repeat(80));

  const testeDiarioOk = resultadoDia.custo_demanda === 0;
  const testeMensalOk = resultadoMes.custo_demanda > 0;

  if (testeDiarioOk && testeMensalOk) {
    console.log('\n✅✅ CENÁRIO C IMPLEMENTADO CORRETAMENTE!');
    console.log('\n   Período DIÁRIO: Demanda não entra no custo ✅');
    console.log('   Período MENSAL: Demanda incluída no custo ✅');
  } else {
    console.log('\n❌ CENÁRIO C COM PROBLEMAS:');
    if (!testeDiarioOk) {
      console.log('   ❌ Período DIÁRIO: Demanda está sendo cobrada (deveria ser R$ 0.00)');
    }
    if (!testeMensalOk) {
      console.log('   ❌ Período MENSAL: Demanda não está sendo cobrada (deveria ter valor)');
    }
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

// Execução
const equipamentoId = process.argv[2];

if (!equipamentoId) {
  console.log('\n❌ Uso: node testar-cenario-c.js <equipamento_id>');
  console.log('Exemplo: node testar-cenario-c.js cmhnk06ka009l2fbkd1o2tyua\n');
  process.exit(1);
}

executarTestes(equipamentoId);
