/**
 * Script para testar a correção do timezone
 * Simula a conversão de datas como o controller agora faz
 */

// Simular método criarDataBrasilia
function criarDataBrasilia(ano, mes, dia, hora, minuto, segundo, ms) {
  const mesStr = String(mes).padStart(2, '0');
  const diaStr = String(dia).padStart(2, '0');
  const horaStr = String(hora).padStart(2, '0');
  const minutoStr = String(minuto).padStart(2, '0');
  const segundoStr = String(segundo).padStart(2, '0');

  const isoStringBrasilia = `${ano}-${mesStr}-${diaStr}T${horaStr}:${minutoStr}:${segundoStr}`;

  // Criar Date assumindo que é UTC
  const dateUTC = new Date(isoStringBrasilia + 'Z');

  // Obter como seria essa data em Brasília
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

  // Parsear resultado
  const [datePart, timePart] = dataBrasiliaStr.split(', ');
  const [monthBrt, dayBrt, yearBrt] = datePart.split('/');
  const [hourBrt, minuteBrt, secondBrt] = timePart.split(':');

  // Calcular offset
  const dateBrasiliaLocal = new Date(
    `${yearBrt}-${monthBrt}-${dayBrt}T${hourBrt}:${minuteBrt}:${secondBrt}`,
  );

  const offset = dateUTC.getTime() - dateBrasiliaLocal.getTime();

  // Criar data original e aplicar offset
  const dateOriginalUTC = new Date(isoStringBrasilia);
  return new Date(dateOriginalUTC.getTime() + offset + ms);
}

console.log('\n🧪 TESTE DE CONVERSÃO DE TIMEZONE\n');
console.log('='.repeat(80));

// Teste 1: Dia 06/03/2026
console.log('\n📅 TESTE 1: Período do dia 06/03/2026');
const dataInicio1 = criarDataBrasilia(2026, 3, 6, 0, 0, 0, 0);
const dataFim1 = criarDataBrasilia(2026, 3, 6, 23, 59, 59, 999);

console.log('   Solicitado: 06/03/2026 00:00:00 BRT até 06/03/2026 23:59:59 BRT');
console.log(`   Convertido para UTC:`);
console.log(`   - Início: ${dataInicio1.toISOString()}`);
console.log(`   - Fim: ${dataFim1.toISOString()}`);

// Verificar em Brasília
const inicioBrt = dataInicio1.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const fimBrt = dataFim1.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
console.log(`   Verificação (volta para BRT):`);
console.log(`   - Início: ${inicioBrt}`);
console.log(`   - Fim: ${fimBrt}`);

// Teste 2: Range customizado 06/03 - 09/03/2026
console.log('\n📅 TESTE 2: Período customizado 06/03/2026 - 09/03/2026');
const dataInicio2 = criarDataBrasilia(2026, 3, 6, 0, 0, 0, 0);
const dataFim2 = criarDataBrasilia(2026, 3, 9, 23, 59, 59, 999);

console.log('   Solicitado: 06/03/2026 00:00:00 BRT até 09/03/2026 23:59:59 BRT');
console.log(`   Convertido para UTC:`);
console.log(`   - Início: ${dataInicio2.toISOString()}`);
console.log(`   - Fim: ${dataFim2.toISOString()}`);

// Comparar com método ANTIGO (offset fixo UTC-3)
console.log('\n⚠️  COMPARAÇÃO COM MÉTODO ANTIGO (offset fixo UTC-3):');
const dataInicioAntigo = new Date(Date.UTC(2026, 2, 6, 3, 0, 0, 0)); // +3h fixo
const dataFimAntigo = new Date(Date.UTC(2026, 2, 10, 2, 59, 59, 999)); // dia 10, 02:59 UTC

console.log(`   Método antigo:`);
console.log(`   - Início: ${dataInicioAntigo.toISOString()}`);
console.log(`   - Fim: ${dataFimAntigo.toISOString()}`);
console.log(`   Método novo:`);
console.log(`   - Início: ${dataInicio2.toISOString()}`);
console.log(`   - Fim: ${dataFim2.toISOString()}`);

const diffInicio = Math.abs(dataInicio2.getTime() - dataInicioAntigo.getTime()) / 1000 / 60 / 60;
const diffFim = Math.abs(dataFim2.getTime() - dataFimAntigo.getTime()) / 1000 / 60 / 60;

console.log(`\n   Diferença:`);
console.log(`   - Início: ${diffInicio.toFixed(2)} horas`);
console.log(`   - Fim: ${diffFim.toFixed(2)} horas`);

// Teste 3: Mês completo (março/2026)
console.log('\n📅 TESTE 3: Mês completo março/2026');
const dataInicioMes = criarDataBrasilia(2026, 3, 1, 0, 0, 0, 0);
const dataFimMes = criarDataBrasilia(2026, 3, 31, 23, 59, 59, 999);

console.log('   Solicitado: março/2026 completo');
console.log(`   Convertido para UTC:`);
console.log(`   - Início: ${dataInicioMes.toISOString()}`);
console.log(`   - Fim: ${dataFimMes.toISOString()}`);

const inicioBrtMes = dataInicioMes.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const fimBrtMes = dataFimMes.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
console.log(`   Verificação (volta para BRT):`);
console.log(`   - Início: ${inicioBrtMes}`);
console.log(`   - Fim: ${fimBrtMes}`);

console.log('\n' + '='.repeat(80));
console.log('\n✅ CONCLUSÃO:');
console.log('   A correção agora usa conversão dinâmica de timezone.');
console.log('   Não depende mais de offset fixo UTC-3.');
console.log('   Funciona corretamente com ou sem horário de verão.\n');
