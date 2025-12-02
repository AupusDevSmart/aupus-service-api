// Script para testar a agregação de demanda com dados reais
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testarAgregacao() {
  // IDs dos inversores com dados confirmados
  const inversoresComDados = [
    { id: 'cmhcfyoj30003jqo8bhhaexlp', nome: 'Inversor 1' },
    { id: 'cmhdd6wkv001kjqo8rl39taa6', nome: 'Inversor 2' },
    { id: 'cmhddtv0h0024jqo8h4dzm4gq', nome: 'Inversor 3' }
  ];

  try {
    console.log('===========================================');
    console.log('TESTE DE AGREGAÇÃO DE DEMANDA');
    console.log('===========================================\n');

    // Data/hora para buscar dados recentes
    const agora = new Date();
    const umaHoraAtras = new Date(agora.getTime() - 60 * 60 * 1000);

    console.log(`Período: ${umaHoraAtras.toLocaleString('pt-BR')} até ${agora.toLocaleString('pt-BR')}\n`);

    // Coletar última leitura de cada equipamento
    const leituras = [];

    for (const inversor of inversoresComDados) {
      console.log(`\n📊 ${inversor.nome} (${inversor.id})`);
      console.log('   ' + '='.repeat(50));

      // Buscar última leitura
      const ultimaLeitura = await prisma.equipamentos_dados.findFirst({
        where: {
          equipamento_id: inversor.id,
          timestamp_dados: { gte: umaHoraAtras }
        },
        orderBy: { timestamp_dados: 'desc' }
      });

      if (!ultimaLeitura) {
        console.log('   ❌ Sem dados na última hora');
        continue;
      }

      console.log(`   ✅ Última leitura: ${ultimaLeitura.timestamp_dados.toLocaleString('pt-BR')}`);

      // Extrair potência seguindo a mesma lógica do frontend
      const dados = ultimaLeitura.dados;
      let potenciaKw = 0;
      let campoUsado = '';

      // Prioridade de campos (mesma do useDadosDemanda.ts)
      if (dados.potencia_kw !== undefined) {
        potenciaKw = dados.potencia_kw;
        campoUsado = 'potencia_kw (backend)';
      } else if (dados.power?.active_total !== undefined) {
        potenciaKw = dados.power.active_total / 1000; // Converter W para kW
        campoUsado = 'power.active_total (inversor)';
      } else if (dados.dc?.total_power !== undefined) {
        potenciaKw = dados.dc.total_power / 1000; // Converter W para kW
        campoUsado = 'dc.total_power (DC)';
      } else if (dados.power_avg !== undefined) {
        potenciaKw = dados.power_avg;
        campoUsado = 'power_avg';
      } else if (dados.active_power_total !== undefined) {
        potenciaKw = dados.active_power_total / 1000; // Converter W para kW
        campoUsado = 'active_power_total';
      } else if (typeof dados.power === 'number') {
        potenciaKw = dados.power / 1000; // Converter W para kW
        campoUsado = 'power (simples)';
      } else if (dados.potencia_ativa_kw !== undefined) {
        potenciaKw = dados.potencia_ativa_kw;
        campoUsado = 'potencia_ativa_kw';
      }

      console.log(`   📍 Campo usado: ${campoUsado}`);
      console.log(`   ⚡ Potência: ${potenciaKw.toFixed(2)} kW`);

      // Mostrar valores dos campos de potência disponíveis
      console.log('\n   📋 Campos de potência disponíveis:');
      if (dados.power?.active_total !== undefined) {
        console.log(`      - power.active_total: ${dados.power.active_total} W (${(dados.power.active_total/1000).toFixed(2)} kW)`);
      }
      if (dados.dc?.total_power !== undefined) {
        console.log(`      - dc.total_power: ${dados.dc.total_power} W (${(dados.dc.total_power/1000).toFixed(2)} kW)`);
      }
      if (dados.power?.active !== undefined) {
        console.log(`      - power.active: ${dados.power.active} W`);
      }
      if (dados.power?.reactive !== undefined) {
        console.log(`      - power.reactive: ${dados.power.reactive} VAr`);
      }
      if (dados.power?.apparent !== undefined) {
        console.log(`      - power.apparent: ${dados.power.apparent} VA`);
      }

      leituras.push({
        equipamento: inversor.nome,
        timestamp: ultimaLeitura.timestamp_dados,
        potenciaKw: potenciaKw,
        campoUsado: campoUsado
      });
    }

    // Calcular agregação
    console.log('\n\n===========================================');
    console.log('RESULTADO DA AGREGAÇÃO');
    console.log('===========================================\n');

    if (leituras.length === 0) {
      console.log('❌ Nenhuma leitura encontrada para agregar');
      return;
    }

    // Somar potências
    const potenciaTotal = leituras.reduce((sum, leitura) => sum + leitura.potenciaKw, 0);

    console.log('📊 Leituras agregadas:');
    leituras.forEach(leitura => {
      console.log(`   - ${leitura.equipamento}: ${leitura.potenciaKw.toFixed(2)} kW`);
    });

    console.log('\n🔋 POTÊNCIA TOTAL AGREGADA: ' + potenciaTotal.toFixed(2) + ' kW');

    // Simular série temporal (últimos 10 pontos)
    console.log('\n\n===========================================');
    console.log('SÉRIE TEMPORAL (últimos 10 pontos)');
    console.log('===========================================\n');

    // Buscar últimos 10 timestamps distintos
    const timestamps = await prisma.$queryRaw`
      SELECT DISTINCT timestamp_dados
      FROM equipamentos_dados
      WHERE equipamento_id IN (${inversoresComDados[0].id}, ${inversoresComDados[1].id}, ${inversoresComDados[2].id})
        AND timestamp_dados >= ${umaHoraAtras}
      ORDER BY timestamp_dados DESC
      LIMIT 10
    `;

    console.log('Timestamp                  | Inv 1 (kW) | Inv 2 (kW) | Inv 3 (kW) | Total (kW)');
    console.log('-'.repeat(80));

    for (const ts of timestamps.reverse()) {
      const timestamp = ts.timestamp_dados;
      const valores = [];

      for (const inversor of inversoresComDados) {
        const leitura = await prisma.equipamentos_dados.findFirst({
          where: {
            equipamento_id: inversor.id,
            timestamp_dados: timestamp
          }
        });

        let potencia = 0;
        if (leitura?.dados) {
          const dados = leitura.dados;
          if (dados.power?.active_total !== undefined) {
            potencia = dados.power.active_total / 1000;
          } else if (dados.dc?.total_power !== undefined) {
            potencia = dados.dc.total_power / 1000;
          }
        }
        valores.push(potencia);
      }

      const total = valores.reduce((sum, val) => sum + val, 0);

      console.log(
        `${timestamp.toLocaleString('pt-BR')} | ` +
        `${valores[0].toFixed(1).padStart(10)} | ` +
        `${valores[1].toFixed(1).padStart(10)} | ` +
        `${valores[2].toFixed(1).padStart(10)} | ` +
        `${total.toFixed(1).padStart(10)}`
      );
    }

    // Configuração sugerida
    console.log('\n\n===========================================');
    console.log('CONFIGURAÇÃO SUGERIDA PARA O MODAL');
    console.log('===========================================\n');

    console.log('Para configurar o gráfico de demanda agregada no modal de configuração:');
    console.log('\n1. Clique no ícone de engrenagem no canto do gráfico de demanda');
    console.log('2. Selecione os seguintes equipamentos:');
    inversoresComDados.forEach(inv => {
      console.log(`   ✅ ${inv.nome} (ID: ${inv.id})`);
    });
    console.log('\n3. O gráfico mostrará a soma da potência destes equipamentos');
    console.log('4. Atualização automática a cada 30 segundos');

    console.log('\n📌 COPIE OS IDS PARA CONFIGURAÇÃO:');
    console.log(JSON.stringify(inversoresComDados.map(i => i.id), null, 2));

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testarAgregacao();