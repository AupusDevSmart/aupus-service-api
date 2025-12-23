/**
 * Script para testar API de custos via HTTP
 *
 * Uso: node testar-api-custos.js <equipamento_id> [data]
 */

const http = require('http');

async function testarAPICustos(equipamentoId, data) {
  const dataParam = data || new Date().toISOString().split('T')[0];

  const url = `http://localhost:3000/equipamentos-dados/${equipamentoId}/custos-energia?periodo=dia&data=${dataParam}`;

  console.log('\n🌐 TESTE DE API DE CUSTOS\n');
  console.log('='.repeat(80));
  console.log(`\n📡 URL: ${url}\n`);

  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`📊 Status Code: ${res.statusCode}\n`);

        if (res.statusCode !== 200) {
          console.log('❌ Erro na requisição:\n');
          console.log(data);
          console.log('\n' + '='.repeat(80) + '\n');
          resolve();
          return;
        }

        try {
          const resultado = JSON.parse(data);

          console.log('✅ Resposta da API:\n');
          console.log(JSON.stringify(resultado, null, 2));
          console.log('\n' + '='.repeat(80));

          // Análise detalhada
          if (resultado.consumo) {
            console.log('\n📊 ANÁLISE DETALHADA:\n');
            console.log(`Período: ${resultado.periodo?.data_inicio} até ${resultado.periodo?.data_fim}`);
            console.log(`Unidade: ${resultado.unidade?.nome} (Grupo ${resultado.unidade?.grupo})`);
            console.log(`Irrigante: ${resultado.unidade?.irrigante ? 'SIM ✅' : 'NÃO'}\n`);

            console.log('CONSUMO:');
            console.log(`  Energia Total: ${resultado.consumo.energia_total_kwh} kWh`);
            console.log(`  - Ponta: ${resultado.consumo.energia_ponta_kwh} kWh`);
            console.log(`  - Fora Ponta: ${resultado.consumo.energia_fora_ponta_kwh} kWh`);
            console.log(`  - Reservado: ${resultado.consumo.energia_reservado_kwh} kWh`);
            console.log(`  - Irrigante: ${resultado.consumo.energia_irrigante_kwh} kWh`);
            console.log(`  Demanda Máxima: ${resultado.consumo.demanda_maxima_kw} kW\n`);

            console.log('CUSTOS:');
            console.log(`  Total: R$ ${resultado.custos.custo_total}`);
            console.log(`  - Ponta: R$ ${resultado.custos.custo_ponta}`);
            console.log(`  - Fora Ponta: R$ ${resultado.custos.custo_fora_ponta}`);
            console.log(`  - Reservado: R$ ${resultado.custos.custo_reservado}`);
            console.log(`  - Irrigante: R$ ${resultado.custos.custo_irrigante}`);
            console.log(`  - Demanda: R$ ${resultado.custos.custo_demanda}`);
            console.log(`  Custo Médio: R$ ${resultado.custos.custo_medio_kwh}/kWh\n`);

            if (resultado.irrigante && resultado.irrigante.economia_total > 0) {
              console.log('💰 ECONOMIA IRRIGANTE:');
              console.log(`  R$ ${resultado.irrigante.economia_total}`);
              console.log(`  ${resultado.irrigante.percentual_desconto}% de desconto no TE`);
              console.log(`  Horário: ${resultado.irrigante.horario_inicio} - ${resultado.irrigante.horario_fim}\n`);
            }

            if (resultado.tarifas_aplicadas && resultado.tarifas_aplicadas.length > 0) {
              console.log('⚡ TARIFAS APLICADAS:');
              resultado.tarifas_aplicadas.forEach(t => {
                console.log(`  ${t.tipo_horario}:`);
                if (t.horario_inicio && t.horario_fim) {
                  console.log(`    Horário: ${t.horario_inicio} - ${t.horario_fim}`);
                }
                console.log(`    TUSD: R$ ${t.tarifa_tusd}/kWh`);
                console.log(`    TE: R$ ${t.tarifa_te}/kWh`);
                console.log(`    Total: R$ ${t.tarifa_total}/kWh`);
                if (t.observacao) {
                  console.log(`    Obs: ${t.observacao}`);
                }
                console.log('');
              });
            }
          }

          console.log('='.repeat(80) + '\n');

        } catch (e) {
          console.log('❌ Erro ao parsear JSON:\n');
          console.log(data);
          console.log('\n' + '='.repeat(80) + '\n');
        }

        resolve();
      });
    }).on('error', (e) => {
      console.log('❌ Erro na conexão:\n');
      console.log(e.message);
      console.log('\n💡 Verifique se o backend está rodando em http://localhost:3000\n');
      console.log('='.repeat(80) + '\n');
      resolve();
    });
  });
}

// Execução
const equipamentoId = process.argv[2];
const data = process.argv[3];

if (!equipamentoId) {
  console.log('\n❌ Uso: node testar-api-custos.js <equipamento_id> [data]');
  console.log('Exemplo: node testar-api-custos.js cmhnk06ka009l2fbkd1o2tyua 2025-12-23\n');
  process.exit(1);
}

testarAPICustos(equipamentoId, data);
