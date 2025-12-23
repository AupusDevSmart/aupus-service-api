/**
 * Script para testar Cenário C com todos os tipos de período
 *
 * Testa:
 * 1. Período DIA: demanda NÃO deve aparecer
 * 2. Período MES: demanda DEVE aparecer
 * 3. Período CUSTOM < 28 dias: demanda NÃO deve aparecer
 * 4. Período CUSTOM >= 28 dias: demanda DEVE aparecer
 *
 * Uso: node testar-todos-periodos.js <equipamento_id>
 */

const http = require('http');

async function testarEndpoint(descricao, url) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📡 ${descricao}`);
  console.log(`${'='.repeat(80)}`);
  console.log(`URL: ${url}\n`);

  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.log(`❌ Status Code: ${res.statusCode}`);
          console.log(`Resposta: ${responseData}\n`);
          resolve({ erro: true, statusCode: res.statusCode });
          return;
        }

        try {
          const resultado = JSON.parse(responseData);

          console.log(`✅ Status: 200 OK`);
          console.log(`📊 Tipo de Período: ${resultado.periodo?.tipo || 'N/A'}`);
          console.log(`📅 Início: ${resultado.periodo?.data_inicio || 'N/A'}`);
          console.log(`📅 Fim: ${resultado.periodo?.data_fim || 'N/A'}`);

          // Calcular duração do período
          if (resultado.periodo?.data_inicio && resultado.periodo?.data_fim) {
            const inicio = new Date(resultado.periodo.data_inicio);
            const fim = new Date(resultado.periodo.data_fim);
            const diffDias = (fim - inicio) / (1000 * 60 * 60 * 24);
            console.log(`⏱️  Duração: ${diffDias.toFixed(1)} dias`);
          }

          console.log(`\n📈 CONSUMO:`);
          console.log(`   Energia Total: ${resultado.consumo?.energia_total_kwh || 0} kWh`);
          console.log(`   Demanda Máxima: ${resultado.consumo?.demanda_maxima_kw || 0} kW`);
          console.log(`   Demanda Contratada: ${resultado.consumo?.demanda_contratada_kw || 0} kW`);

          console.log(`\n💰 CUSTOS:`);
          console.log(`   Energia (P): R$ ${resultado.custos?.custo_ponta || 0}`);
          console.log(`   Energia (FP): R$ ${resultado.custos?.custo_fora_ponta || 0}`);
          console.log(`   Energia (Reservado): R$ ${resultado.custos?.custo_reservado || 0}`);
          console.log(`   Energia (Irrigante): R$ ${resultado.custos?.custo_irrigante || 0}`);
          console.log(`   >>> DEMANDA: R$ ${resultado.custos?.custo_demanda || 0} <<<`);
          console.log(`   TOTAL: R$ ${resultado.custos?.custo_total || 0}`);

          resolve({
            periodo: resultado.periodo?.tipo,
            duracao_dias: resultado.periodo?.data_inicio && resultado.periodo?.data_fim
              ? (new Date(resultado.periodo.data_fim) - new Date(resultado.periodo.data_inicio)) / (1000 * 60 * 60 * 24)
              : 0,
            energia_total: resultado.consumo?.energia_total_kwh || 0,
            demanda_maxima: resultado.consumo?.demanda_maxima_kw || 0,
            custo_demanda: resultado.custos?.custo_demanda || 0,
            custo_total: resultado.custos?.custo_total || 0,
          });

        } catch (e) {
          console.log(`❌ Erro ao parsear JSON: ${e.message}\n`);
          resolve({ erro: true });
        }
      });
    }).on('error', (e) => {
      console.log(`❌ Erro na conexão: ${e.message}`);
      console.log(`💡 Verifique se o backend está rodando em http://localhost:3000\n`);
      resolve({ erro: true });
    });
  });
}

async function executarTestes(equipamentoId) {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 TESTE COMPLETO - CENÁRIO C: DEMANDA APENAS EM PERÍODOS MENSAIS');
  console.log('='.repeat(80));
  console.log(`\nEquipamento: ${equipamentoId}\n`);

  const hoje = new Date();
  const dataHoje = hoje.toISOString().split('T')[0]; // YYYY-MM-DD
  const mesAtual = dataHoje.substring(0, 7); // YYYY-MM

  // Calcular datas para testes customizados
  const dataFimCustom = new Date(hoje);

  // Custom 1: 7 dias (1 semana) - demanda NÃO deve aparecer
  const dataInicioSemana = new Date(hoje);
  dataInicioSemana.setDate(dataInicioSemana.getDate() - 7);
  const timestampInicioSemana = dataInicioSemana.toISOString();
  const timestampFimSemana = dataFimCustom.toISOString();

  // Custom 2: 30 dias (1 mês) - demanda DEVE aparecer
  const dataInicioMes30 = new Date(hoje);
  dataInicioMes30.setDate(dataInicioMes30.getDate() - 30);
  const timestampInicioMes30 = dataInicioMes30.toISOString();
  const timestampFimMes30 = dataFimCustom.toISOString();

  const resultados = [];

  // TESTE 1: Período DIÁRIO
  const url1 = `http://localhost:3000/equipamentos-dados/${equipamentoId}/custos-energia?periodo=dia&data=${dataHoje}`;
  const res1 = await testarEndpoint('TESTE 1: PERÍODO DIÁRIO (demanda NÃO deve aparecer)', url1);
  resultados.push({ teste: 'DIA', ...res1 });

  // TESTE 2: Período MENSAL
  const url2 = `http://localhost:3000/equipamentos-dados/${equipamentoId}/custos-energia?periodo=mes&data=${mesAtual}`;
  const res2 = await testarEndpoint('TESTE 2: PERÍODO MENSAL (demanda DEVE aparecer)', url2);
  resultados.push({ teste: 'MES', ...res2 });

  // TESTE 3: Período CUSTOM - 7 dias (< 28 dias)
  const url3 = `http://localhost:3000/equipamentos-dados/${equipamentoId}/custos-energia?periodo=custom&timestamp_inicio=${timestampInicioSemana}&timestamp_fim=${timestampFimSemana}`;
  const res3 = await testarEndpoint('TESTE 3: PERÍODO CUSTOM 7 DIAS (demanda NÃO deve aparecer)', url3);
  resultados.push({ teste: 'CUSTOM_7D', ...res3 });

  // TESTE 4: Período CUSTOM - 30 dias (>= 28 dias)
  const url4 = `http://localhost:3000/equipamentos-dados/${equipamentoId}/custos-energia?periodo=custom&timestamp_inicio=${timestampInicioMes30}&timestamp_fim=${timestampFimMes30}`;
  const res4 = await testarEndpoint('TESTE 4: PERÍODO CUSTOM 30 DIAS (demanda DEVE aparecer)', url4);
  resultados.push({ teste: 'CUSTOM_30D', ...res4 });

  // ANÁLISE FINAL
  console.log('\n' + '='.repeat(80));
  console.log('📊 ANÁLISE FINAL - CENÁRIO C');
  console.log('='.repeat(80));

  let todosPassaram = true;

  // Verificar TESTE 1: DIA
  console.log('\n✅ TESTE 1: PERÍODO DIÁRIO');
  if (resultados[0].erro) {
    console.log('   ❌ ERRO: Teste falhou - endpoint retornou erro');
    todosPassaram = false;
  } else if (resultados[0].custo_demanda === 0) {
    console.log('   ✅ PASSOU: Custo de demanda = R$ 0.00 (correto)');
  } else {
    console.log(`   ❌ FALHOU: Custo de demanda = R$ ${resultados[0].custo_demanda} (deveria ser R$ 0.00)`);
    todosPassaram = false;
  }

  // Verificar TESTE 2: MES
  console.log('\n✅ TESTE 2: PERÍODO MENSAL');
  if (resultados[1].erro) {
    console.log('   ❌ ERRO: Teste falhou - endpoint retornou erro');
    todosPassaram = false;
  } else if (resultados[1].custo_demanda > 0) {
    console.log(`   ✅ PASSOU: Custo de demanda = R$ ${resultados[1].custo_demanda} (correto)`);
  } else {
    console.log(`   ❌ FALHOU: Custo de demanda = R$ ${resultados[1].custo_demanda} (deveria ser > R$ 0.00)`);
    todosPassaram = false;
  }

  // Verificar TESTE 3: CUSTOM 7 dias
  console.log('\n✅ TESTE 3: PERÍODO CUSTOM 7 DIAS (< 28 dias)');
  if (resultados[2].erro) {
    console.log('   ❌ ERRO: Teste falhou - endpoint retornou erro');
    todosPassaram = false;
  } else if (resultados[2].custo_demanda === 0) {
    console.log('   ✅ PASSOU: Custo de demanda = R$ 0.00 (correto)');
  } else {
    console.log(`   ❌ FALHOU: Custo de demanda = R$ ${resultados[2].custo_demanda} (deveria ser R$ 0.00)`);
    todosPassaram = false;
  }

  // Verificar TESTE 4: CUSTOM 30 dias
  console.log('\n✅ TESTE 4: PERÍODO CUSTOM 30 DIAS (>= 28 dias)');
  if (resultados[3].erro) {
    console.log('   ❌ ERRO: Teste falhou - endpoint retornou erro');
    todosPassaram = false;
  } else if (resultados[3].custo_demanda > 0) {
    console.log(`   ✅ PASSOU: Custo de demanda = R$ ${resultados[3].custo_demanda} (correto)`);
  } else {
    console.log(`   ❌ FALHOU: Custo de demanda = R$ ${resultados[3].custo_demanda} (deveria ser > R$ 0.00)`);
    todosPassaram = false;
  }

  // RESUMO FINAL
  console.log('\n' + '='.repeat(80));
  console.log('🎯 RESUMO FINAL');
  console.log('='.repeat(80));

  if (todosPassaram) {
    console.log('\n✅✅✅ TODOS OS TESTES PASSARAM! CENÁRIO C IMPLEMENTADO CORRETAMENTE!\n');
    console.log('Regras validadas:');
    console.log('   ✅ Período DIÁRIO: Demanda NÃO cobrada');
    console.log('   ✅ Período MENSAL: Demanda cobrada');
    console.log('   ✅ Período CUSTOM < 28 dias: Demanda NÃO cobrada');
    console.log('   ✅ Período CUSTOM >= 28 dias: Demanda cobrada');
  } else {
    console.log('\n❌ ALGUNS TESTES FALHARAM\n');
    console.log('Verifique os detalhes acima para identificar os problemas.');
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

// Execução
const equipamentoId = process.argv[2];

if (!equipamentoId) {
  console.log('\n❌ Uso: node testar-todos-periodos.js <equipamento_id>');
  console.log('Exemplo: node testar-todos-periodos.js cmhnk06ka009l2fbkd1o2tyua\n');
  process.exit(1);
}

executarTestes(equipamentoId);
