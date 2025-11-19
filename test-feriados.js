// Script de teste para validar feriados nacionais 2025
// Execute com: node test-feriados.js

console.log('🇧🇷 Testando Feriados Nacionais Brasileiros 2025\n');

// Algoritmo de Meeus para calcular Páscoa
function calcularPascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function adicionarDias(date, dias) {
  const resultado = new Date(date);
  resultado.setDate(resultado.getDate() + dias);
  return resultado;
}

function formatarData(date) {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function isFeriadoNacional(date) {
  const dia = date.getDate();
  const mes = date.getMonth() + 1;
  const ano = date.getFullYear();

  // Feriados Fixos
  const feriadosFixos = [
    [1, 1],    // Ano Novo
    [21, 4],   // Tiradentes
    [1, 5],    // Dia do Trabalho
    [7, 9],    // Independência
    [12, 10],  // Nossa Senhora Aparecida
    [2, 11],   // Finados
    [15, 11],  // Proclamação da República
    [25, 12],  // Natal
  ];

  for (const [d, m] of feriadosFixos) {
    if (dia === d && mes === m) return true;
  }

  // Feriados Móveis
  const pascoa = calcularPascoa(ano);
  const carnaval = adicionarDias(pascoa, -47);
  const sextaSanta = adicionarDias(pascoa, -2);
  const corpusChristi = adicionarDias(pascoa, 60);

  const dataAtual = formatarData(date);
  const feriadosMoveis = [
    formatarData(carnaval),
    formatarData(sextaSanta),
    formatarData(corpusChristi),
  ];

  return feriadosMoveis.includes(dataAtual);
}

// === TESTES ===

const pascoa2025 = calcularPascoa(2025);
console.log(`📅 Páscoa 2025: ${formatarData(pascoa2025)}`);

const carnaval2025 = adicionarDias(pascoa2025, -47);
const sextaSanta2025 = adicionarDias(pascoa2025, -2);
const corpusChristi2025 = adicionarDias(pascoa2025, 60);

console.log(`🎭 Carnaval 2025: ${formatarData(carnaval2025)}`);
console.log(`✝️  Sexta-feira Santa 2025: ${formatarData(sextaSanta2025)}`);
console.log(`🕊️  Corpus Christi 2025: ${formatarData(corpusChristi2025)}\n`);

console.log('='.repeat(60));
console.log('Testando detecção de feriados:\n');

const testes = [
  ['2025-01-01', true, 'Ano Novo'],
  ['2025-01-02', false, 'Dia comum'],
  ['2025-03-04', true, 'Carnaval'],
  ['2025-04-18', true, 'Sexta-feira Santa'],
  ['2025-04-21', true, 'Tiradentes'],
  ['2025-05-01', true, 'Dia do Trabalho'],
  ['2025-06-19', true, 'Corpus Christi'],
  ['2025-09-07', true, 'Independência'],
  ['2025-10-12', true, 'Nossa Senhora Aparecida'],
  ['2025-11-02', true, 'Finados'],
  ['2025-11-15', true, 'Proclamação da República'],
  ['2025-12-25', true, 'Natal'],
  ['2025-06-15', false, 'Dia comum (domingo antes Corpus)'],
  ['2025-11-13', false, 'Hoje (dia comum)'],
];

let passou = 0;
let falhou = 0;

for (const [dataStr, esperado, nome] of testes) {
  const data = new Date(dataStr + 'T12:00:00');
  const resultado = isFeriadoNacional(data);
  const status = resultado === esperado ? '✅' : '❌';

  if (resultado === esperado) {
    passou++;
    console.log(`${status} ${dataStr} - ${nome}: ${esperado ? 'FERIADO' : 'DIA COMUM'}`);
  } else {
    falhou++;
    console.log(`${status} ${dataStr} - ${nome}: ESPERADO=${esperado}, GOT=${resultado} ⚠️`);
  }
}

console.log('\n' + '='.repeat(60));
console.log(`\n📊 Resultado: ${passou}/${testes.length} testes passaram`);

if (falhou === 0) {
  console.log('✅ TODOS OS TESTES PASSARAM! 🎉\n');
} else {
  console.log(`❌ ${falhou} teste(s) falharam\n`);
  process.exit(1);
}
