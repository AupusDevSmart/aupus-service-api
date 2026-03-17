/**
 * Script de teste para validar a correção de timezone
 * Testa a conversão correta de UTC para America/Sao_Paulo
 */

const { utcToZonedTime } = require('date-fns-tz');

console.log('\n🧪 TESTE DE CONVERSÃO DE TIMEZONE\n');
console.log('='.repeat(80));

// Cenários de teste
const testCases = [
  {
    nome: 'Horário de Ponta (19:00 BRT = 22:00 UTC)',
    timestampUTC: new Date('2025-11-07T22:00:00.000Z'),
    esperado: { hora: 19, classificacao: 'PONTA' }
  },
  {
    nome: 'Fora de Ponta (10:00 BRT = 13:00 UTC)',
    timestampUTC: new Date('2025-11-07T13:00:00.000Z'),
    esperado: { hora: 10, classificacao: 'FORA_PONTA' }
  },
  {
    nome: 'Horário Reservado (23:00 BRT = 02:00 UTC do dia seguinte)',
    timestampUTC: new Date('2025-11-08T02:00:00.000Z'),
    esperado: { hora: 23, classificacao: 'RESERVADO' }
  },
  {
    nome: 'Horário Reservado (03:00 BRT = 06:00 UTC)',
    timestampUTC: new Date('2025-11-07T06:00:00.000Z'),
    esperado: { hora: 3, classificacao: 'RESERVADO' }
  },
  {
    nome: 'Início Ponta (18:00 BRT = 21:00 UTC)',
    timestampUTC: new Date('2025-11-07T21:00:00.000Z'),
    esperado: { hora: 18, classificacao: 'PONTA' }
  },
  {
    nome: 'Fim Ponta (20:59 BRT = 23:59 UTC)',
    timestampUTC: new Date('2025-11-07T23:59:00.000Z'),
    esperado: { hora: 20, classificacao: 'PONTA' }
  },
  {
    nome: 'Após Ponta (21:00 BRT = 00:00 UTC do dia seguinte)',
    timestampUTC: new Date('2025-11-08T00:00:00.000Z'),
    esperado: { hora: 21, classificacao: 'FORA_PONTA' }
  },
  {
    nome: 'Início HR (21:30 BRT = 00:30 UTC do dia seguinte)',
    timestampUTC: new Date('2025-11-08T00:30:00.000Z'),
    esperado: { hora: 21, minutos: 30, classificacao: 'RESERVADO' }
  },
];

// Função auxiliar para classificar horário
function classificarHorario(hora, minutos) {
  const horaDecimal = hora + minutos / 60;

  // Horário Reservado (21:30 - 06:00)
  if (horaDecimal >= 21.5 || horaDecimal < 6) {
    return 'RESERVADO';
  }

  // Ponta (18:00 - 21:00)
  if (hora >= 18 && hora < 21) {
    return 'PONTA';
  }

  // Fora Ponta (resto)
  return 'FORA_PONTA';
}

// Executar testes
let passados = 0;
let falhados = 0;

testCases.forEach((test, index) => {
  console.log(`\n📋 Teste ${index + 1}: ${test.nome}`);
  console.log('-'.repeat(80));

  // Timestamp original (UTC)
  console.log(`   Timestamp UTC:     ${test.timestampUTC.toISOString()}`);
  console.log(`   UTC hora:          ${test.timestampUTC.getUTCHours()}:${String(test.timestampUTC.getUTCMinutes()).padStart(2, '0')}`);

  // Conversão CORRETA usando date-fns-tz
  const timestampBrasilia = utcToZonedTime(test.timestampUTC, 'America/Sao_Paulo');
  const hora = timestampBrasilia.getHours();
  const minutos = timestampBrasilia.getMinutes();
  const classificacao = classificarHorario(hora, minutos);

  console.log(`   Brasília (BRT):    ${timestampBrasilia.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  console.log(`   BRT hora:          ${hora}:${String(minutos).padStart(2, '0')}`);
  console.log(`   Classificação:     ${classificacao}`);

  // Validar resultado
  const horaOk = hora === test.esperado.hora;
  const minutosOk = test.esperado.minutos === undefined || minutos === test.esperado.minutos;
  const classificacaoOk = classificacao === test.esperado.classificacao;

  const passou = horaOk && minutosOk && classificacaoOk;

  if (passou) {
    console.log(`   ✅ PASSOU`);
    passados++;
  } else {
    console.log(`   ❌ FALHOU`);
    if (!horaOk) console.log(`      - Hora esperada: ${test.esperado.hora}, obtida: ${hora}`);
    if (!minutosOk) console.log(`      - Minutos esperados: ${test.esperado.minutos}, obtidos: ${minutos}`);
    if (!classificacaoOk) console.log(`      - Classificação esperada: ${test.esperado.classificacao}, obtida: ${classificacao}`);
    falhados++;
  }
});

// Resumo
console.log('\n' + '='.repeat(80));
console.log('📊 RESUMO DOS TESTES\n');
console.log(`   Total:    ${testCases.length}`);
console.log(`   ✅ Passou:  ${passados}`);
console.log(`   ❌ Falhou:  ${falhados}`);
console.log('='.repeat(80));

// Teste adicional: conversão antiga vs nova
console.log('\n🔬 COMPARAÇÃO: MÉTODO ANTIGO vs MÉTODO NOVO\n');
console.log('='.repeat(80));

const timestampTeste = new Date('2025-11-07T22:00:00.000Z'); // 19:00 BRT

console.log(`Timestamp UTC: ${timestampTeste.toISOString()}`);
console.log(`Hora UTC: ${timestampTeste.getUTCHours()}:00\n`);

// Método ANTIGO (BUGADO)
const timestampLocalAntigo = new Date(
  timestampTeste.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
);
console.log('❌ MÉTODO ANTIGO (BUGADO):');
console.log(`   String intermediária: "${timestampTeste.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })}"`);
console.log(`   Date resultante:      ${timestampLocalAntigo.toISOString()}`);
console.log(`   Hora interpretada:    ${timestampLocalAntigo.getHours()}:00`);
console.log(`   ⚠️  Pode estar errado dependendo do timezone do servidor!\n`);

// Método NOVO (CORRETO)
const timestampBrasiliaCorreto = utcToZonedTime(timestampTeste, 'America/Sao_Paulo');
console.log('✅ MÉTODO NOVO (CORRETO):');
console.log(`   Date em Brasília:     ${timestampBrasiliaCorreto.toISOString()}`);
console.log(`   Hora BRT:             ${timestampBrasiliaCorreto.getHours()}:00`);
console.log(`   ✅ Sempre correto, independente do servidor!\n`);

console.log('='.repeat(80));

process.exit(falhados > 0 ? 1 : 0);
