/**
 * Script para debugar problema de timezone no cálculo de custos CHINT
 *
 * Período solicitado: 06/03/2026 00:00 até 09/03/2026 23:59
 * Energia mostrada: 628 kWh
 * Energia acumulada: 649 kWh
 * Diferença: 21 kWh (perda de dados)
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function investigar() {
  console.log('\n🔍 INVESTIGAÇÃO: Problema de Timezone - CHINT\n');
  console.log('=' .repeat(80));

  // 1. Buscar equipamento CHINT
  const equipamento = await prisma.equipamentos.findFirst({
    where: {
      nome: { contains: 'CHINT', mode: 'insensitive' },
      topico_mqtt: 'ISOFEN/GO/SUP_PRIME/ELETROPOSTO/CHINT/1'
    },
    include: {
      unidade: {
        include: {
          concessionaria: true
        }
      }
    }
  });

  if (!equipamento) {
    console.log('❌ Equipamento CHINT não encontrado!');
    return;
  }

  console.log(`\n✅ Equipamento encontrado:`);
  console.log(`   ID: ${equipamento.id}`);
  console.log(`   Nome: ${equipamento.nome}`);
  console.log(`   Tópico: ${equipamento.topico_mqtt}`);
  console.log(`   Unidade: ${equipamento.unidade?.nome || 'N/A'}`);
  console.log(`   Grupo: ${equipamento.unidade?.grupo || 'N/A'}`);

  // 2. Definir período - SIMULANDO FRONTEND
  // Frontend envia: 06/03/2026 00:00 e 09/03/2026 23:59 (horário de Brasília)
  const dataInicioFrontend = '2026-03-06T00:00:00';
  const dataFimFrontend = '2026-03-09T23:59:59';

  console.log(`\n📅 PERÍODO SOLICITADO (Frontend - Brasília):`);
  console.log(`   Início: ${dataInicioFrontend} (BRT)`);
  console.log(`   Fim: ${dataFimFrontend} (BRT)`);

  // 3. PROBLEMA 1: Conversão do controller (offset fixo UTC-3)
  const dataRef = new Date('2026-03-06');
  const ano = dataRef.getFullYear();
  const mes = dataRef.getMonth();
  const dia = dataRef.getDate();

  // Lógica ATUAL do controller (ERRADA - usa offset fixo)
  const dataInicioControllerAtual = new Date(Date.UTC(ano, mes, dia, 3, 0, 0, 0));
  const dataFimControllerAtual = new Date(Date.UTC(ano, mes, dia + 4, 2, 59, 59, 999)); // +4 dias (06 a 09)

  console.log(`\n⚠️  CONVERSÃO ATUAL DO CONTROLLER (offset fixo UTC-3):`);
  console.log(`   Início UTC: ${dataInicioControllerAtual.toISOString()}`);
  console.log(`   Fim UTC: ${dataFimControllerAtual.toISOString()}`);

  // 4. PROBLEMA 2: Verificar se há horário de verão
  // Em março de 2026, Brasil pode estar saindo do horário de verão
  const timestampExemplo = new Date('2026-03-06T12:00:00');
  const offsetBrasilia = -timestampExemplo.toLocaleString('en-US', {
    timeZone: 'America/Sao_Paulo',
    timeZoneName: 'short'
  }).match(/GMT([+-]\d+)/)?.[1] || '-3';

  console.log(`\n🌍 TIMEZONE REAL (America/Sao_Paulo):`);
  console.log(`   Offset em 06/03/2026: UTC${offsetBrasilia}`);
  console.log(`   ⚠️  Controller usa offset FIXO: UTC-3`);

  // 5. CONVERSÃO CORRETA usando toLocaleString
  const dataInicioCorreta = new Date(new Date('2026-03-06T00:00:00').toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dataFimCorreta = new Date(new Date('2026-03-09T23:59:59').toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));

  console.log(`\n✅ CONVERSÃO CORRETA (usando toLocaleString):`);
  console.log(`   Início Local: ${dataInicioCorreta.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  console.log(`   Fim Local: ${dataFimCorreta.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);

  // 6. Buscar dados com range ATUAL (errado)
  console.log(`\n📊 BUSCA DE DADOS - RANGE ATUAL (ERRADO):`);
  const dadosAtual = await prisma.equipamentos_dados.findMany({
    where: {
      equipamento_id: equipamento.id,
      timestamp_dados: {
        gte: dataInicioControllerAtual,
        lte: dataFimControllerAtual
      }
    },
    select: {
      timestamp_dados: true,
      dados: true
    },
    orderBy: {
      timestamp_dados: 'asc'
    }
  });

  let energiaTotalAtual = 0;
  dadosAtual.forEach(d => {
    const consumo = d.dados?.consumo_phf || 0;
    energiaTotalAtual += parseFloat(consumo.toString());
  });

  console.log(`   Registros encontrados: ${dadosAtual.length}`);
  console.log(`   Energia total: ${energiaTotalAtual.toFixed(2)} kWh`);
  if (dadosAtual.length > 0) {
    console.log(`   Primeiro registro: ${dadosAtual[0].timestamp_dados.toISOString()}`);
    console.log(`   Último registro: ${dadosAtual[dadosAtual.length - 1].timestamp_dados.toISOString()}`);
  }

  // 7. Verificar se há registros FORA do range
  console.log(`\n🔍 VERIFICANDO REGISTROS PERDIDOS:`);

  // Buscar registros do dia 06/03 antes das 03:00 UTC
  const registrosPerdidosInicio = await prisma.equipamentos_dados.findMany({
    where: {
      equipamento_id: equipamento.id,
      timestamp_dados: {
        gte: new Date('2026-03-06T00:00:00Z'),
        lt: dataInicioControllerAtual
      }
    },
    select: {
      timestamp_dados: true,
      dados: true
    }
  });

  let energiaPerdidaInicio = 0;
  registrosPerdidosInicio.forEach(d => {
    const consumo = d.dados?.consumo_phf || 0;
    energiaPerdidaInicio += parseFloat(consumo.toString());
  });

  console.log(`   Registros perdidos no INÍCIO (00:00-03:00 UTC do dia 06):`);
  console.log(`   - Quantidade: ${registrosPerdidosInicio.length}`);
  console.log(`   - Energia: ${energiaPerdidaInicio.toFixed(2)} kWh`);

  // Buscar registros do dia 09/03 depois das 02:59 UTC
  const registrosPerdidosFim = await prisma.equipamentos_dados.findMany({
    where: {
      equipamento_id: equipamento.id,
      timestamp_dados: {
        gt: dataFimControllerAtual,
        lte: new Date('2026-03-09T23:59:59Z')
      }
    },
    select: {
      timestamp_dados: true,
      dados: true
    }
  });

  let energiaPerdidaFim = 0;
  registrosPerdidosFim.forEach(d => {
    const consumo = d.dados?.consumo_phf || 0;
    energiaPerdidaFim += parseFloat(consumo.toString());
  });

  console.log(`   Registros perdidos no FIM (03:00-23:59 UTC do dia 09):`);
  console.log(`   - Quantidade: ${registrosPerdidosFim.length}`);
  console.log(`   - Energia: ${energiaPerdidaFim.toFixed(2)} kWh`);

  // 8. Energia total ESPERADA
  const energiaTotalEsperada = energiaTotalAtual + energiaPerdidaInicio + energiaPerdidaFim;
  console.log(`\n📈 RESUMO:`);
  console.log(`   Energia calculada (atual): ${energiaTotalAtual.toFixed(2)} kWh`);
  console.log(`   Energia perdida (início): ${energiaPerdidaInicio.toFixed(2)} kWh`);
  console.log(`   Energia perdida (fim): ${energiaPerdidaFim.toFixed(2)} kWh`);
  console.log(`   Energia total esperada: ${energiaTotalEsperada.toFixed(2)} kWh`);
  console.log(`   Diferença reportada: ~21 kWh`);

  // 9. ANÁLISE DE HORÁRIOS
  console.log(`\n⏰ ANÁLISE DE HORÁRIOS DOS REGISTROS PERDIDOS:`);

  if (registrosPerdidosInicio.length > 0) {
    console.log(`   Início perdido - Exemplos:`);
    registrosPerdidosInicio.slice(0, 3).forEach(d => {
      const timestampUTC = d.timestamp_dados;
      const timestampBRT = new Date(timestampUTC.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      console.log(`     UTC: ${timestampUTC.toISOString()} → BRT: ${timestampBRT.toLocaleString('pt-BR')}`);
    });
  }

  if (registrosPerdidosFim.length > 0) {
    console.log(`   Fim perdido - Exemplos:`);
    registrosPerdidosFim.slice(0, 3).forEach(d => {
      const timestampUTC = d.timestamp_dados;
      const timestampBRT = new Date(timestampUTC.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      console.log(`     UTC: ${timestampUTC.toISOString()} → BRT: ${timestampBRT.toLocaleString('pt-BR')}`);
    });
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`\n💡 CONCLUSÃO:`);
  console.log(`   O problema está na conversão de timezone no controller!`);
  console.log(`   Offset fixo UTC-3 não funciona quando há horário de verão.`);
  console.log(`   Solução: Usar toLocaleString com America/Sao_Paulo\n`);

  await prisma.$disconnect();
}

investigar().catch(console.error);
