// Script para verificar dados dos equipamentos na tabela equipamentos_dados
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verificarDados() {
  const equipamentosIds = [
    'cmhdd6wkv001kjqo8rl39taa6', // Inversor 2
    'cmhnk06ka009l2fbkd1o2tyua', // M-160 1
    'cmhddtv0h0024jqo8h4dzm4gq', // Inversor 3
    'cmhcfyoj30003jqo8bhhaexlp'  // Inversor 1
  ];

  const equipamentosInfo = {
    'cmhdd6wkv001kjqo8rl39taa6': 'Inversor 2',
    'cmhnk06ka009l2fbkd1o2tyua': 'M-160 1',
    'cmhddtv0h0024jqo8h4dzm4gq': 'Inversor 3',
    'cmhcfyoj30003jqo8bhhaexlp': 'Inversor 1'
  };

  try {
    console.log('===========================================');
    console.log('VERIFICAÇÃO DE DADOS NA TABELA EQUIPAMENTOS_DADOS');
    console.log('===========================================\n');

    // Verificar cada equipamento
    for (const id of equipamentosIds) {
      const nome = equipamentosInfo[id];
      console.log(`\n📊 ${nome} (${id})`);
      console.log('   ' + '='.repeat(60));

      // Contar total de registros
      const totalRegistros = await prisma.equipamentos_dados.count({
        where: { equipamento_id: id }
      });

      console.log(`   Total de registros: ${totalRegistros}`);

      if (totalRegistros === 0) {
        console.log('   ❌ SEM DADOS');
        continue;
      }

      // Buscar dados recentes (últimas 24 horas)
      const ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);

      const dadosRecentes = await prisma.equipamentos_dados.findMany({
        where: {
          equipamento_id: id,
          timestamp_dados: { gte: ontem }
        },
        take: 3,
        orderBy: { timestamp_dados: 'desc' }
      });

      console.log(`   Registros das últimas 24h: ${dadosRecentes.length}`);

      if (dadosRecentes.length > 0) {
        console.log('\n   📋 AMOSTRA DOS DADOS:');

        dadosRecentes.forEach((dado, idx) => {
          console.log(`\n   Registro ${idx + 1}:`);
          console.log(`     Timestamp: ${dado.timestamp_dados}`);

          const dados = dado.dados;
          console.log('     Estrutura do JSON:');

          // Verificar campos de potência
          let potenciaEncontrada = false;

          if (dados.power?.active_total !== undefined) {
            console.log(`       ✅ power.active_total: ${dados.power.active_total} W`);
            potenciaEncontrada = true;
          }
          if (dados.dc?.total_power !== undefined) {
            console.log(`       ✅ dc.total_power: ${dados.dc.total_power} W`);
            potenciaEncontrada = true;
          }
          if (dados.power?.active !== undefined) {
            console.log(`       ✅ power.active: ${dados.power.active} W`);
            potenciaEncontrada = true;
          }
          if (dados.power_avg !== undefined) {
            console.log(`       ✅ power_avg: ${dados.power_avg} kW`);
            potenciaEncontrada = true;
          }
          if (dados.potencia_ativa_kw !== undefined) {
            console.log(`       ✅ potencia_ativa_kw: ${dados.potencia_ativa_kw} kW`);
            potenciaEncontrada = true;
          }
          if (dados.potencia_kw !== undefined) {
            console.log(`       ✅ potencia_kw: ${dados.potencia_kw} kW`);
            potenciaEncontrada = true;
          }
          if (dados.Dados?.Pa !== undefined) {
            console.log(`       ✅ M160: Pa=${dados.Dados.Pa}, Pb=${dados.Dados.Pb}, Pc=${dados.Dados.Pc} W`);
            potenciaEncontrada = true;
          }

          if (!potenciaEncontrada) {
            console.log('       ⚠️ Campo de potência não encontrado!');
            console.log('       Campos disponíveis:', Object.keys(dados).slice(0, 10).join(', '));
          }
        });

        // Mostrar estrutura completa do primeiro registro
        if (dadosRecentes[0]) {
          console.log('\n   📄 ESTRUTURA COMPLETA (primeiro registro):');
          console.log(JSON.stringify(dadosRecentes[0].dados, null, 2).substring(0, 1000) + '...');
        }
      }

      // Estatísticas gerais
      const primeiroRegistro = await prisma.equipamentos_dados.findFirst({
        where: { equipamento_id: id },
        orderBy: { timestamp_dados: 'asc' }
      });

      const ultimoRegistro = await prisma.equipamentos_dados.findFirst({
        where: { equipamento_id: id },
        orderBy: { timestamp_dados: 'desc' }
      });

      if (primeiroRegistro && ultimoRegistro) {
        console.log('\n   📈 PERÍODO DOS DADOS:');
        console.log(`     Primeiro: ${primeiroRegistro.timestamp_dados}`);
        console.log(`     Último: ${ultimoRegistro.timestamp_dados}`);
      }
    }

    console.log('\n\n===========================================');
    console.log('RESUMO PARA CONFIGURAÇÃO DE AGREGAÇÃO');
    console.log('===========================================\n');

    // Verificar quais equipamentos têm dados hoje
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const equipamentosComDadosHoje = [];

    for (const id of equipamentosIds) {
      const count = await prisma.equipamentos_dados.count({
        where: {
          equipamento_id: id,
          timestamp_dados: { gte: hoje }
        }
      });

      if (count > 0) {
        equipamentosComDadosHoje.push({
          id,
          nome: equipamentosInfo[id],
          registrosHoje: count
        });
      }
    }

    if (equipamentosComDadosHoje.length > 0) {
      console.log('✅ Equipamentos com dados HOJE para agregação:');
      equipamentosComDadosHoje.forEach(eq => {
        console.log(`   - ${eq.nome}: ${eq.registrosHoje} registros`);
      });

      console.log('\n📌 IDs para configuração:');
      console.log(JSON.stringify(equipamentosComDadosHoje.map(e => e.id), null, 2));
    } else {
      console.log('❌ NENHUM equipamento tem dados de hoje!');
      console.log('   O gráfico de demanda agregada aparecerá vazio.');
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verificarDados();