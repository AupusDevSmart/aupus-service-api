// tests/run-all-tests.ts
// Script Principal para Executar Todos os Testes

import { runInfrastructureTests } from './00-infrastructure.test';
import { runCrudTests } from './01-api-crud.test';
import { runAuthTests } from './02-authentication.test';
import { runPermissionsTests } from './03-permissions.test';
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  data?: any;
}

interface PhaseResult {
  phase: string;
  results: TestResult[];
  passed: number;
  failed: number;
  warned: number;
  total: number;
  duration: number;
}

async function runAllTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    AUPUS NEXON - SUITE COMPLETA DE TESTES                 ║');
  console.log('║                         Sistema de Usuários e Permissões                   ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  const startTime = Date.now();
  const phases: PhaseResult[] = [];
  const failures: Array<{ phase: string; test: string; message: string }> = [];

  // FASE 1: Infraestrutura
  console.log('🚀 Executando FASE 1: Testes de Infraestrutura...\n');
  const phase1Start = Date.now();
  try {
    const results1 = await runInfrastructureTests();
    const phase1Duration = Date.now() - phase1Start;

    phases.push({
      phase: 'FASE 1: Infraestrutura',
      results: results1,
      passed: results1.filter(r => r.status === 'PASS').length,
      failed: results1.filter(r => r.status === 'FAIL').length,
      warned: results1.filter(r => r.status === 'WARN').length,
      total: results1.length,
      duration: phase1Duration
    });

    // Coletar falhas críticas
    results1.filter(r => r.status === 'FAIL').forEach(r => {
      failures.push({
        phase: 'Infraestrutura',
        test: r.test,
        message: r.message
      });
    });

    // Se houver falhas críticas na infraestrutura, avisar
    const criticalFailures = results1.filter(r =>
      r.status === 'FAIL' && (
        r.test.includes('Tabelas') ||
        r.test.includes('Roles Cadastradas') ||
        r.test.includes('Permissions Cadastradas')
      )
    );

    if (criticalFailures.length > 0) {
      console.log('\n⚠️  ATENÇÃO: Falhas críticas detectadas na infraestrutura!');
      console.log('   As próximas fases podem falhar devido a problemas de base.');
      console.log('   Considere corrigir a infraestrutura antes de continuar.\n');

      // Perguntar se deseja continuar (em produção, poderia simplesmente parar)
      console.log('   Continuando com os testes...\n');
    }
  } catch (error: any) {
    console.error('❌ Erro fatal na FASE 1:', error.message);
    phases.push({
      phase: 'FASE 1: Infraestrutura',
      results: [],
      passed: 0,
      failed: 1,
      warned: 0,
      total: 1,
      duration: Date.now() - phase1Start
    });
  }

  // FASE 2: CRUD
  console.log('\n🚀 Executando FASE 2: Testes de CRUD...\n');
  const phase2Start = Date.now();
  try {
    const results2 = await runCrudTests();
    const phase2Duration = Date.now() - phase2Start;

    phases.push({
      phase: 'FASE 2: CRUD de Usuários',
      results: results2,
      passed: results2.filter(r => r.status === 'PASS').length,
      failed: results2.filter(r => r.status === 'FAIL').length,
      warned: results2.filter(r => r.status === 'WARN').length,
      total: results2.length,
      duration: phase2Duration
    });

    results2.filter(r => r.status === 'FAIL').forEach(r => {
      failures.push({
        phase: 'CRUD',
        test: r.test,
        message: r.message
      });
    });
  } catch (error: any) {
    console.error('❌ Erro fatal na FASE 2:', error.message);
    phases.push({
      phase: 'FASE 2: CRUD de Usuários',
      results: [],
      passed: 0,
      failed: 1,
      warned: 0,
      total: 1,
      duration: Date.now() - phase2Start
    });
  }

  // FASE 3: Autenticação
  console.log('\n🚀 Executando FASE 3: Testes de Autenticação...\n');
  const phase3Start = Date.now();
  try {
    const results3 = await runAuthTests();
    const phase3Duration = Date.now() - phase3Start;

    phases.push({
      phase: 'FASE 3: Autenticação',
      results: results3,
      passed: results3.filter(r => r.status === 'PASS').length,
      failed: results3.filter(r => r.status === 'FAIL').length,
      warned: results3.filter(r => r.status === 'WARN').length,
      total: results3.length,
      duration: phase3Duration
    });

    results3.filter(r => r.status === 'FAIL').forEach(r => {
      failures.push({
        phase: 'Autenticação',
        test: r.test,
        message: r.message
      });
    });
  } catch (error: any) {
    console.error('❌ Erro fatal na FASE 3:', error.message);
    phases.push({
      phase: 'FASE 3: Autenticação',
      results: [],
      passed: 0,
      failed: 1,
      warned: 0,
      total: 1,
      duration: Date.now() - phase3Start
    });
  }

  // FASE 4: Permissions
  console.log('\n🚀 Executando FASE 4: Testes de Permissions...\n');
  const phase4Start = Date.now();
  try {
    const results4 = await runPermissionsTests();
    const phase4Duration = Date.now() - phase4Start;

    phases.push({
      phase: 'FASE 4: Roles e Permissions',
      results: results4,
      passed: results4.filter(r => r.status === 'PASS').length,
      failed: results4.filter(r => r.status === 'FAIL').length,
      warned: results4.filter(r => r.status === 'WARN').length,
      total: results4.length,
      duration: phase4Duration
    });

    results4.filter(r => r.status === 'FAIL').forEach(r => {
      failures.push({
        phase: 'Permissions',
        test: r.test,
        message: r.message
      });
    });
  } catch (error: any) {
    console.error('❌ Erro fatal na FASE 4:', error.message);
    phases.push({
      phase: 'FASE 4: Roles e Permissions',
      results: [],
      passed: 0,
      failed: 1,
      warned: 0,
      total: 1,
      duration: Date.now() - phase4Start
    });
  }

  // Calcular totais gerais
  const totalPassed = phases.reduce((sum, p) => sum + p.passed, 0);
  const totalFailed = phases.reduce((sum, p) => sum + p.failed, 0);
  const totalWarned = phases.reduce((sum, p) => sum + p.warned, 0);
  const totalTests = phases.reduce((sum, p) => sum + p.total, 0);
  const totalDuration = Date.now() - startTime;

  // Relatório Final
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                            RELATÓRIO FINAL DE TESTES                       ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  // Resumo por fase
  console.log('📊 RESUMO POR FASE:\n');
  phases.forEach((phase, index) => {
    console.log(`${index + 1}. ${phase.phase}`);
    console.log(`   ✅ PASS: ${phase.passed}`);
    console.log(`   ❌ FAIL: ${phase.failed}`);
    console.log(`   ⚠️  WARN: ${phase.warned}`);
    console.log(`   📝 TOTAL: ${phase.total}`);
    console.log(`   ⏱️  Duração: ${(phase.duration / 1000).toFixed(2)}s`);
    console.log('');
  });

  // Totais gerais
  console.log('═'.repeat(80));
  console.log('\n📈 TOTAIS GERAIS:\n');
  console.log(`   ✅ PASS: ${totalPassed} (${((totalPassed / totalTests) * 100).toFixed(1)}%)`);
  console.log(`   ❌ FAIL: ${totalFailed} (${((totalFailed / totalTests) * 100).toFixed(1)}%)`);
  console.log(`   ⚠️  WARN: ${totalWarned} (${((totalWarned / totalTests) * 100).toFixed(1)}%)`);
  console.log(`   📝 TOTAL: ${totalTests}`);
  console.log(`   ⏱️  Duração Total: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log('');

  // Lista de falhas
  if (failures.length > 0) {
    console.log('═'.repeat(80));
    console.log('\n❌ LISTA DE FALHAS:\n');

    failures.forEach((failure, index) => {
      console.log(`${index + 1}. [${failure.phase}] ${failure.test}`);
      console.log(`   ${failure.message}`);
      console.log('');
    });
  }

  // Avaliação final
  console.log('═'.repeat(80));
  console.log('\n🎯 AVALIAÇÃO FINAL:\n');

  const successRate = (totalPassed / totalTests) * 100;

  if (successRate >= 90) {
    console.log('   🎉 EXCELENTE! Sistema está funcionando muito bem.');
    console.log('   A taxa de sucesso está acima de 90%.');
  } else if (successRate >= 70) {
    console.log('   ✅ BOM! Sistema está funcional com alguns problemas.');
    console.log('   A taxa de sucesso está entre 70-90%.');
    console.log('   Recomenda-se corrigir as falhas encontradas.');
  } else if (successRate >= 50) {
    console.log('   ⚠️  ATENÇÃO! Sistema tem problemas significativos.');
    console.log('   A taxa de sucesso está entre 50-70%.');
    console.log('   É necessário corrigir as falhas antes de usar em produção.');
  } else {
    console.log('   ❌ CRÍTICO! Sistema NÃO está funcionando adequadamente.');
    console.log('   A taxa de sucesso está abaixo de 50%.');
    console.log('   NÃO use em produção até corrigir os problemas.');
  }

  console.log('');
  console.log('═'.repeat(80));

  // Salvar relatório em arquivo
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalTests,
      totalPassed,
      totalFailed,
      totalWarned,
      successRate: successRate.toFixed(2) + '%',
      duration: totalDuration
    },
    phases: phases.map(p => ({
      phase: p.phase,
      passed: p.passed,
      failed: p.failed,
      warned: p.warned,
      total: p.total,
      duration: p.duration
    })),
    failures: failures,
    allResults: phases.map(p => ({
      phase: p.phase,
      results: p.results
    }))
  };

  const reportsDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const reportPath = path.join(reportsDir, `test-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n📄 Relatório salvo em: ${reportPath}\n`);

  // Exit code baseado em falhas
  const exitCode = totalFailed > 0 ? 1 : 0;
  return { exitCode, report };
}

// Executar se chamado diretamente
if (require.main === module) {
  runAllTests()
    .then(({ exitCode }) => {
      process.exit(exitCode);
    })
    .catch((error) => {
      console.error('\n❌ ERRO FATAL ao executar suite de testes:');
      console.error(error);
      process.exit(1);
    });
}

export { runAllTests };
