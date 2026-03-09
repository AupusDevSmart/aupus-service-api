/**
 * Teste REAL com dados do CHINT no banco
 * Comparar energia calculada vs energia acumulada
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Método ANTIGO (offset fixo)
function calcularRangeAntigo(ano, mes, dia) {
  const dataInicio = new Date(Date.UTC(ano, mes - 1, dia, 3, 0, 0, 0));
  const dataFim = new Date(Date.UTC(ano, mes - 1, dia + 1, 2, 59, 59, 999));
  return { dataInicio, dataFim };
}

// Método NOVO (dinâmico)
function criarDataBrasilia(ano, mes, dia, hora, minuto, segundo, ms) {
  const mesStr = String(mes).padStart(2, '0');
  const diaStr = String(dia).padStart(2, '0');
  const horaStr = String(hora).padStart(2, '0');
  const minutoStr = String(minuto).padStart(2, '0');
  const segundoStr = String(segundo).padStart(2, '0');

  const isoStringBrasilia = `${ano}-${mesStr}-${diaStr}T${horaStr}:${minutoStr}:${segundoStr}`;
  const dateUTC = new Date(isoStringBrasilia + 'Z');

  const dataBrasiliaStr = dateUTC.toLocaleString('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const [datePart, timePart] = dataBrasiliaStr.split(', ');
  const [monthBrt, dayBrt, yearBrt] = datePart.split('/');
  const [hourBrt, minuteBrt, secondBrt] = timePart.split(':');

  const dateBrasiliaLocal = new Date(
    `${yearBrt}-${monthBrt}-${dayBrt}T${hourBrt}:${minuteBrt}:${secondBrt}`,
  );

  const offset = dateUTC.getTime() - dateBrasiliaLocal.getTime();
  const dateOriginalUTC = new Date(isoStringBrasilia);
  return new Date(dateOriginalUTC.getTime() + offset + ms);
}

async function testar() {
  console.log('\n🔍 TESTE REAL - CHINT (06/03/2026 - 09/03/2026)\n');
  console.log('='.repeat(80));

  // Buscar equipamento CHINT
  const equipamento = await prisma.equipamentos.findFirst({
    where: {
      nome: { contains: 'CHINT', mode: 'insensitive' },
    },
  });

  if (!equipamento) {
    console.log('❌ Equipamento CHINT não encontrado!');
    return;
  }

  console.log(`✅ Equipamento: ${equipamento.nome} (${equipamento.id})\n`);

  // TESTE 1: Método ANTIGO (dia 06/03)
  console.log('📊 TESTE 1: Método ANTIGO (offset fixo UTC-3) - DIA 06/03');
  const rangeAntigo06 = calcularRangeAntigo(2026, 3, 6);
  console.log(`   Range: ${rangeAntigo06.dataInicio.toISOString()} até ${rangeAntigo06.dataFim.toISOString()}`);

  const dadosAntigo06 = await prisma.equipamentos_dados.findMany({
    where: {
      equipamento_id: equipamento.id,
      timestamp_dados: {
        gte: rangeAntigo06.dataInicio,
        lte: rangeAntigo06.dataFim,
      },
    },
    select: { dados: true },
  });

  let energiaAntigo06 = 0;
  dadosAntigo06.forEach(d => {
    energiaAntigo06 += parseFloat(d.dados?.consumo_phf?.toString() || '0');
  });

  console.log(`   Registros: ${dadosAntigo06.length}`);
  console.log(`   Energia: ${energiaAntigo06.toFixed(2)} kWh\n`);

  // TESTE 2: Método NOVO (dia 06/03)
  console.log('📊 TESTE 2: Método NOVO (dinâmico) - DIA 06/03');
  const dataInicioNovo06 = criarDataBrasilia(2026, 3, 6, 0, 0, 0, 0);
  const dataFimNovo06 = criarDataBrasilia(2026, 3, 6, 23, 59, 59, 999);
  console.log(`   Range: ${dataInicioNovo06.toISOString()} até ${dataFimNovo06.toISOString()}`);

  const dadosNovo06 = await prisma.equipamentos_dados.findMany({
    where: {
      equipamento_id: equipamento.id,
      timestamp_dados: {
        gte: dataInicioNovo06,
        lte: dataFimNovo06,
      },
    },
    select: { dados: true },
  });

  let energiaNovo06 = 0;
  dadosNovo06.forEach(d => {
    energiaNovo06 += parseFloat(d.dados?.consumo_phf?.toString() || '0');
  });

  console.log(`   Registros: ${dadosNovo06.length}`);
  console.log(`   Energia: ${energiaNovo06.toFixed(2)} kWh\n`);

  // TESTE 3: Período CUSTOMIZADO 06/03 - 09/03 (ANTIGO)
  console.log('📊 TESTE 3: Período 06/03-09/03 - Método ANTIGO');
  const rangeAntigoCustom = {
    dataInicio: new Date(Date.UTC(2026, 2, 6, 3, 0, 0, 0)),
    dataFim: new Date(Date.UTC(2026, 2, 10, 2, 59, 59, 999)),
  };
  console.log(`   Range: ${rangeAntigoCustom.dataInicio.toISOString()} até ${rangeAntigoCustom.dataFim.toISOString()}`);

  const dadosAntigoCustom = await prisma.equipamentos_dados.findMany({
    where: {
      equipamento_id: equipamento.id,
      timestamp_dados: {
        gte: rangeAntigoCustom.dataInicio,
        lte: rangeAntigoCustom.dataFim,
      },
    },
    select: { dados: true },
  });

  let energiaAntigoCustom = 0;
  dadosAntigoCustom.forEach(d => {
    energiaAntigoCustom += parseFloat(d.dados?.consumo_phf?.toString() || '0');
  });

  console.log(`   Registros: ${dadosAntigoCustom.length}`);
  console.log(`   Energia: ${energiaAntigoCustom.toFixed(2)} kWh\n`);

  // TESTE 4: Período CUSTOMIZADO 06/03 - 09/03 (NOVO)
  console.log('📊 TESTE 4: Período 06/03-09/03 - Método NOVO');
  const dataInicioNovoCustom = criarDataBrasilia(2026, 3, 6, 0, 0, 0, 0);
  const dataFimNovoCustom = criarDataBrasilia(2026, 3, 9, 23, 59, 59, 999);
  console.log(`   Range: ${dataInicioNovoCustom.toISOString()} até ${dataFimNovoCustom.toISOString()}`);

  const dadosNovoCustom = await prisma.equipamentos_dados.findMany({
    where: {
      equipamento_id: equipamento.id,
      timestamp_dados: {
        gte: dataInicioNovoCustom,
        lte: dataFimNovoCustom,
      },
    },
    select: { dados: true, timestamp_dados: true },
    orderBy: { timestamp_dados: 'asc' },
  });

  let energiaNovoCustom = 0;
  dadosNovoCustom.forEach(d => {
    energiaNovoCustom += parseFloat(d.dados?.consumo_phf?.toString() || '0');
  });

  console.log(`   Registros: ${dadosNovoCustom.length}`);
  console.log(`   Energia: ${energiaNovoCustom.toFixed(2)} kWh`);

  if (dadosNovoCustom.length > 0) {
    const primeiro = dadosNovoCustom[0].timestamp_dados;
    const ultimo = dadosNovoCustom[dadosNovoCustom.length - 1].timestamp_dados;
    console.log(`   Primeiro registro: ${primeiro.toISOString()} (${primeiro.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })})`);
    console.log(`   Último registro: ${ultimo.toISOString()} (${ultimo.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })})`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n📈 COMPARAÇÃO:');
  console.log(`   Energia reportada na tela: 628 kWh`);
  console.log(`   Energia acumulada esperada: 649 kWh`);
  console.log(`   Diferença reportada: ~21 kWh\n`);
  console.log(`   Energia calculada (antigo): ${energiaAntigoCustom.toFixed(2)} kWh`);
  console.log(`   Energia calculada (novo): ${energiaNovoCustom.toFixed(2)} kWh`);
  console.log(`   Diferença entre métodos: ${Math.abs(energiaNovoCustom - energiaAntigoCustom).toFixed(2)} kWh\n`);

  // TESTE 5: Verificar se existem dados FORA do range que deveriam estar dentro
  console.log('🔍 INVESTIGAÇÃO: Dados que podem estar sendo perdidos');

  // Buscar todos os dados de 06/03 a 09/03 em UTC puro
  const todosDados = await prisma.equipamentos_dados.findMany({
    where: {
      equipamento_id: equipamento.id,
      timestamp_dados: {
        gte: new Date('2026-03-06T00:00:00Z'),
        lte: new Date('2026-03-09T23:59:59Z'),
      },
    },
    select: { dados: true },
  });

  let energiaTotal = 0;
  todosDados.forEach(d => {
    energiaTotal += parseFloat(d.dados?.consumo_phf?.toString() || '0');
  });

  console.log(`   Todos os dados UTC 06/03-09/03: ${todosDados.length} registros`);
  console.log(`   Energia total: ${energiaTotal.toFixed(2)} kWh\n`);

  await prisma.$disconnect();
}

testar().catch(console.error);
