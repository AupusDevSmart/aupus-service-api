/**
 * Script de Teste Automatizado - Fluxo Completo de Ordens de Serviço
 *
 * Este script testa todas as APIs do fluxo OS usando dados reais do banco
 * e gera um relatório detalhado de sucessos e falhas.
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3000';

// Carregar dados reais extraídos
const dadosReais = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'scripts-teste', 'dados-extraidos.json'), 'utf-8')
);

interface TesteResultado {
  modulo: string;
  teste: string;
  status: 'SUCESSO' | 'FALHA' | 'AVISO';
  detalhes: string;
  erro?: any;
  tempo: number;
}

const resultados: TesteResultado[] = [];

function log(mensagem: string) {
  console.log(`[${new Date().toISOString()}] ${mensagem}`);
}

function registrarResultado(resultado: TesteResultado) {
  resultados.push(resultado);
  const emoji = resultado.status === 'SUCESSO' ? '✅' : resultado.status === 'FALHA' ? '❌' : '⚠️';
  log(`${emoji} [${resultado.modulo}] ${resultado.teste} - ${resultado.status} (${resultado.tempo}ms)`);
  if (resultado.detalhes) {
    log(`   └─ ${resultado.detalhes}`);
  }
  if (resultado.erro) {
    log(`   └─ Erro: ${resultado.erro.message || JSON.stringify(resultado.erro)}`);
  }
}

async function testarAPI(metodo: string, endpoint: string, dados?: any): Promise<any> {
  try {
    const config: any = {
      method: metodo,
      url: `${API_URL}${endpoint}`,
      timeout: 10000,
    };

    if (dados) {
      config.data = dados;
    }

    const response = await axios(config);
    return { sucesso: true, data: response.data, status: response.status };
  } catch (error: any) {
    return {
      sucesso: false,
      erro: error.response?.data || error.message,
      status: error.response?.status || 500
    };
  }
}

// ==========================================
// TESTES DE PLANOS DE MANUTENÇÃO
// ==========================================
async function testarPlanos() {
  log('\n═══════════════════════════════════════');
  log('  TESTANDO PLANOS DE MANUTENÇÃO');
  log('═══════════════════════════════════════');

  const inicio = Date.now();

  // Teste 1: Listar planos existentes
  const teste1Inicio = Date.now();
  const listarPlanos = await testarAPI('GET', '/planos-manutencao');
  registrarResultado({
    modulo: 'Planos',
    teste: 'Listar planos existentes',
    status: listarPlanos.sucesso ? 'SUCESSO' : 'FALHA',
    detalhes: listarPlanos.sucesso
      ? `Encontrados ${listarPlanos.data?.length || 0} planos`
      : 'Falha ao listar planos',
    erro: listarPlanos.erro,
    tempo: Date.now() - teste1Inicio,
  });

  // Teste 2: Buscar plano específico
  if (dadosReais.planos?.length > 0) {
    const planoId = dadosReais.planos[0].id;
    const teste2Inicio = Date.now();
    const buscarPlano = await testarAPI('GET', `/planos-manutencao/${planoId}`);
    registrarResultado({
      modulo: 'Planos',
      teste: 'Buscar plano por ID',
      status: buscarPlano.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: buscarPlano.sucesso
        ? `Plano encontrado: ${buscarPlano.data?.nome}`
        : `Plano ${planoId} não encontrado`,
      erro: buscarPlano.erro,
      tempo: Date.now() - teste2Inicio,
    });
  } else {
    registrarResultado({
      modulo: 'Planos',
      teste: 'Buscar plano por ID',
      status: 'AVISO',
      detalhes: 'Nenhum plano disponível para testar',
      tempo: 0,
    });
  }

  log(`\n⏱️  Tempo total dos testes de Planos: ${Date.now() - inicio}ms`);
}

// ==========================================
// TESTES DE TAREFAS
// ==========================================
async function testarTarefas() {
  log('\n═══════════════════════════════════════');
  log('  TESTANDO TAREFAS');
  log('═══════════════════════════════════════');

  const inicio = Date.now();

  // Teste 1: Listar tarefas
  const teste1Inicio = Date.now();
  const listarTarefas = await testarAPI('GET', '/tarefas');
  registrarResultado({
    modulo: 'Tarefas',
    teste: 'Listar tarefas',
    status: listarTarefas.sucesso ? 'SUCESSO' : 'FALHA',
    detalhes: listarTarefas.sucesso
      ? `Encontradas ${listarTarefas.data?.length || 0} tarefas`
      : 'Falha ao listar tarefas',
    erro: listarTarefas.erro,
    tempo: Date.now() - teste1Inicio,
  });

  // Teste 2: Buscar tarefa por ID
  if (dadosReais.tarefas?.length > 0) {
    const tarefaId = dadosReais.tarefas[0].id;
    const teste2Inicio = Date.now();
    const buscarTarefa = await testarAPI('GET', `/tarefas/${tarefaId}`);
    registrarResultado({
      modulo: 'Tarefas',
      teste: 'Buscar tarefa por ID',
      status: buscarTarefa.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: buscarTarefa.sucesso
        ? `Tarefa encontrada: ${buscarTarefa.data?.descricao}`
        : `Tarefa ${tarefaId} não encontrada`,
      erro: buscarTarefa.erro,
      tempo: Date.now() - teste2Inicio,
    });
  } else {
    registrarResultado({
      modulo: 'Tarefas',
      teste: 'Buscar tarefa por ID',
      status: 'AVISO',
      detalhes: 'Nenhuma tarefa disponível para testar',
      tempo: 0,
    });
  }

  log(`\n⏱️  Tempo total dos testes de Tarefas: ${Date.now() - inicio}ms`);
}

// ==========================================
// TESTES DE ANOMALIAS
// ==========================================
async function testarAnomalias() {
  log('\n═══════════════════════════════════════');
  log('  TESTANDO ANOMALIAS');
  log('═══════════════════════════════════════');

  const inicio = Date.now();

  // Teste 1: Listar anomalias
  const teste1Inicio = Date.now();
  const listarAnomalias = await testarAPI('GET', '/anomalias');
  registrarResultado({
    modulo: 'Anomalias',
    teste: 'Listar anomalias',
    status: listarAnomalias.sucesso ? 'SUCESSO' : 'FALHA',
    detalhes: listarAnomalias.sucesso
      ? `Encontradas ${listarAnomalias.data?.length || 0} anomalias`
      : 'Falha ao listar anomalias',
    erro: listarAnomalias.erro,
    tempo: Date.now() - teste1Inicio,
  });

  // Teste 2: Buscar anomalia por ID
  if (dadosReais.anomalias?.length > 0) {
    const anomaliaId = dadosReais.anomalias[0].id;
    const teste2Inicio = Date.now();
    const buscarAnomalia = await testarAPI('GET', `/anomalias/${anomaliaId}`);
    registrarResultado({
      modulo: 'Anomalias',
      teste: 'Buscar anomalia por ID',
      status: buscarAnomalia.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: buscarAnomalia.sucesso
        ? `Anomalia encontrada: ${buscarAnomalia.data?.descricao}`
        : `Anomalia ${anomaliaId} não encontrada`,
      erro: buscarAnomalia.erro,
      tempo: Date.now() - teste2Inicio,
    });

    // Teste 3: Filtrar por status
    const teste3Inicio = Date.now();
    const filtrarStatus = await testarAPI('GET', '/anomalias?status=AGUARDANDO');
    registrarResultado({
      modulo: 'Anomalias',
      teste: 'Filtrar por status AGUARDANDO',
      status: filtrarStatus.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: filtrarStatus.sucesso
        ? `Encontradas ${filtrarStatus.data?.length || 0} anomalias aguardando`
        : 'Falha ao filtrar anomalias',
      erro: filtrarStatus.erro,
      tempo: Date.now() - teste3Inicio,
    });
  } else {
    registrarResultado({
      modulo: 'Anomalias',
      teste: 'Buscar anomalia por ID',
      status: 'AVISO',
      detalhes: 'Nenhuma anomalia disponível para testar',
      tempo: 0,
    });
  }

  log(`\n⏱️  Tempo total dos testes de Anomalias: ${Date.now() - inicio}ms`);
}

// ==========================================
// TESTES DE PROGRAMAÇÃO OS
// ==========================================
async function testarProgramacoes() {
  log('\n═══════════════════════════════════════');
  log('  TESTANDO PROGRAMAÇÕES OS');
  log('═══════════════════════════════════════');

  const inicio = Date.now();

  // Teste 1: Listar programações
  const teste1Inicio = Date.now();
  const listarProgramacoes = await testarAPI('GET', '/programacoes-os');
  registrarResultado({
    modulo: 'Programações',
    teste: 'Listar programações',
    status: listarProgramacoes.sucesso ? 'SUCESSO' : 'FALHA',
    detalhes: listarProgramacoes.sucesso
      ? `Encontradas ${listarProgramacoes.data?.length || 0} programações`
      : 'Falha ao listar programações',
    erro: listarProgramacoes.erro,
    tempo: Date.now() - teste1Inicio,
  });

  // Teste 2: Buscar programação por ID
  if (dadosReais.programacoes?.length > 0) {
    const progId = dadosReais.programacoes[0].id;
    const teste2Inicio = Date.now();
    const buscarProg = await testarAPI('GET', `/programacoes-os/${progId}`);
    registrarResultado({
      modulo: 'Programações',
      teste: 'Buscar programação por ID',
      status: buscarProg.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: buscarProg.sucesso
        ? `Programação encontrada: ${buscarProg.data?.titulo || buscarProg.data?.nome}`
        : `Programação ${progId} não encontrada`,
      erro: buscarProg.erro,
      tempo: Date.now() - teste2Inicio,
    });

    // Teste 3: Filtrar por status
    const teste3Inicio = Date.now();
    const filtrarStatus = await testarAPI('GET', '/programacoes-os?status=APROVADA');
    registrarResultado({
      modulo: 'Programações',
      teste: 'Filtrar por status APROVADA',
      status: filtrarStatus.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: filtrarStatus.sucesso
        ? `Encontradas ${filtrarStatus.data?.length || 0} programações aprovadas`
        : 'Falha ao filtrar programações',
      erro: filtrarStatus.erro,
      tempo: Date.now() - teste3Inicio,
    });
  } else {
    registrarResultado({
      modulo: 'Programações',
      teste: 'Buscar programação por ID',
      status: 'AVISO',
      detalhes: 'Nenhuma programação disponível para testar',
      tempo: 0,
    });
  }

  log(`\n⏱️  Tempo total dos testes de Programações: ${Date.now() - inicio}ms`);
}

// ==========================================
// TESTES DE ORDENS DE SERVIÇO
// ==========================================
async function testarOS() {
  log('\n═══════════════════════════════════════');
  log('  TESTANDO ORDENS DE SERVIÇO');
  log('═══════════════════════════════════════');

  const inicio = Date.now();

  // Teste 1: Listar OS
  const teste1Inicio = Date.now();
  const listarOS = await testarAPI('GET', '/ordens-servico');
  registrarResultado({
    modulo: 'Ordens de Serviço',
    teste: 'Listar ordens de serviço',
    status: listarOS.sucesso ? 'SUCESSO' : 'FALHA',
    detalhes: listarOS.sucesso
      ? `Encontradas ${listarOS.data?.length || 0} ordens de serviço`
      : 'Falha ao listar OS',
    erro: listarOS.erro,
    tempo: Date.now() - teste1Inicio,
  });

  // Teste 2: Buscar OS por ID
  if (dadosReais.ordensServico?.length > 0) {
    const osId = dadosReais.ordensServico[0].id;
    const teste2Inicio = Date.now();
    const buscarOS = await testarAPI('GET', `/ordens-servico/${osId}`);
    registrarResultado({
      modulo: 'Ordens de Serviço',
      teste: 'Buscar OS por ID',
      status: buscarOS.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: buscarOS.sucesso
        ? `OS encontrada: ${buscarOS.data?.numero_os}`
        : `OS ${osId} não encontrada`,
      erro: buscarOS.erro,
      tempo: Date.now() - teste2Inicio,
    });

    // Teste 3: Filtrar por status
    const teste3Inicio = Date.now();
    const filtrarStatus = await testarAPI('GET', '/ordens-servico?status=PLANEJADA');
    registrarResultado({
      modulo: 'Ordens de Serviço',
      teste: 'Filtrar por status PLANEJADA',
      status: filtrarStatus.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: filtrarStatus.sucesso
        ? `Encontradas ${filtrarStatus.data?.length || 0} OS planejadas`
        : 'Falha ao filtrar OS',
      erro: filtrarStatus.erro,
      tempo: Date.now() - teste3Inicio,
    });
  } else {
    registrarResultado({
      modulo: 'Ordens de Serviço',
      teste: 'Buscar OS por ID',
      status: 'AVISO',
      detalhes: 'Nenhuma OS disponível para testar',
      tempo: 0,
    });
  }

  log(`\n⏱️  Tempo total dos testes de OS: ${Date.now() - inicio}ms`);
}

// ==========================================
// VERIFICAÇÃO DE BANCO DE DADOS
// ==========================================
async function verificarBanco() {
  log('\n═══════════════════════════════════════');
  log('  VERIFICANDO BANCO DE DADOS');
  log('═══════════════════════════════════════');

  const inicio = Date.now();

  try {
    // Contar registros de cada tabela
    const [planos, tarefas, anomalias, programacoes, os] = await Promise.all([
      prisma.planos_manutencao.count({ where: { deleted_at: null } }),
      prisma.tarefas.count({ where: { deleted_at: null } }),
      prisma.anomalias.count({ where: { deleted_at: null } }),
      prisma.programacoes_os.count(),
      prisma.ordens_servico.count(),
    ]);

    registrarResultado({
      modulo: 'Banco de Dados',
      teste: 'Verificar integridade dos dados',
      status: 'SUCESSO',
      detalhes: `Planos: ${planos}, Tarefas: ${tarefas}, Anomalias: ${anomalias}, Programações: ${programacoes}, OS: ${os}`,
      tempo: Date.now() - inicio,
    });
  } catch (error) {
    registrarResultado({
      modulo: 'Banco de Dados',
      teste: 'Verificar integridade dos dados',
      status: 'FALHA',
      detalhes: 'Erro ao acessar banco de dados',
      erro: error,
      tempo: Date.now() - inicio,
    });
  }
}

// ==========================================
// GERAÇÃO DE RELATÓRIO
// ==========================================
function gerarRelatorio() {
  log('\n═══════════════════════════════════════');
  log('  GERANDO RELATÓRIO');
  log('═══════════════════════════════════════');

  const sucessos = resultados.filter(r => r.status === 'SUCESSO').length;
  const falhas = resultados.filter(r => r.status === 'FALHA').length;
  const avisos = resultados.filter(r => r.status === 'AVISO').length;
  const total = resultados.length;

  const relatorio = `
# Relatório de Testes - Fluxo Completo de Ordens de Serviço

**Data:** ${new Date().toLocaleString('pt-BR')}
**Total de Testes:** ${total}

## 📊 Resumo Geral

- ✅ **Sucessos:** ${sucessos} (${((sucessos/total)*100).toFixed(1)}%)
- ❌ **Falhas:** ${falhas} (${((falhas/total)*100).toFixed(1)}%)
- ⚠️  **Avisos:** ${avisos} (${((avisos/total)*100).toFixed(1)}%)

## 📋 Resultados por Módulo

${gerarResumoModulos()}

## 📝 Detalhes dos Testes

${resultados.map((r, i) => `
### ${i + 1}. ${r.modulo} - ${r.teste}

- **Status:** ${r.status === 'SUCESSO' ? '✅ SUCESSO' : r.status === 'FALHA' ? '❌ FALHA' : '⚠️ AVISO'}
- **Tempo:** ${r.tempo}ms
- **Detalhes:** ${r.detalhes}
${r.erro ? `- **Erro:** \`\`\`json\n${JSON.stringify(r.erro, null, 2)}\n\`\`\`` : ''}
`).join('\n')}

## 🔍 Análise e Recomendações

${gerarRecomendacoes()}

## 📌 Próximos Passos

${gerarProximosPassos()}

---
**Relatório gerado automaticamente pelo script testar-fluxo-os.ts**
`;

  const outputPath = path.join(__dirname, '..', '..', '..', 'RELATORIO-TESTES-OS.md');
  fs.writeFileSync(outputPath, relatorio);

  log(`\n📄 Relatório salvo em: ${outputPath}`);

  return relatorio;
}

function gerarResumoModulos() {
  const modulos = [...new Set(resultados.map(r => r.modulo))];

  return modulos.map(modulo => {
    const testesModulo = resultados.filter(r => r.modulo === modulo);
    const sucessos = testesModulo.filter(r => r.status === 'SUCESSO').length;
    const falhas = testesModulo.filter(r => r.status === 'FALHA').length;
    const avisos = testesModulo.filter(r => r.status === 'AVISO').length;

    return `### ${modulo}
- ✅ Sucessos: ${sucessos}
- ❌ Falhas: ${falhas}
- ⚠️ Avisos: ${avisos}`;
  }).join('\n\n');
}

function gerarRecomendacoes() {
  const falhas = resultados.filter(r => r.status === 'FALHA');

  if (falhas.length === 0) {
    return '✅ **Todos os testes passaram!** O sistema está funcionando corretamente.';
  }

  const recomendacoes = falhas.map(f => {
    if (f.erro?.status === 404) {
      return `- **${f.modulo}:** Endpoint \`${f.teste}\` não encontrado. Verifique se a rota está implementada.`;
    }
    if (f.erro?.status === 500) {
      return `- **${f.modulo}:** Erro interno no servidor em \`${f.teste}\`. Verifique os logs do backend.`;
    }
    return `- **${f.modulo}:** Falha em \`${f.teste}\`. Detalhes: ${f.detalhes}`;
  });

  return recomendacoes.join('\n');
}

function gerarProximosPassos() {
  const falhas = resultados.filter(r => r.status === 'FALHA');

  if (falhas.length === 0) {
    return `
1. ✅ Executar testes E2E do fluxo completo
2. ✅ Testar transições de estado
3. ✅ Validar regras de negócio
4. ✅ Testar casos de erro e edge cases`;
  }

  return `
1. ❌ Corrigir as ${falhas.length} falhas identificadas
2. ⚠️ Re-executar os testes após correções
3. 📝 Atualizar documentação se necessário
4. 🔄 Implementar endpoints faltantes se houver`;
}

// ==========================================
// MAIN
// ==========================================
async function main() {
  const inicioTotal = Date.now();

  log('═══════════════════════════════════════════════════════════');
  log('  INICIANDO TESTES AUTOMATIZADOS - FLUXO OS COMPLETO');
  log('═══════════════════════════════════════════════════════════');
  log(`API URL: ${API_URL}`);
  log(`Dados reais carregados: ${Object.keys(dadosReais).length} entidades`);

  try {
    // Verificar banco antes dos testes
    await verificarBanco();

    // Executar todos os testes
    await testarPlanos();
    await testarTarefas();
    await testarAnomalias();
    await testarProgramacoes();
    await testarOS();

    // Gerar relatório
    const relatorio = gerarRelatorio();

    log('\n═══════════════════════════════════════════════════════════');
    log('  TESTES CONCLUÍDOS');
    log('═══════════════════════════════════════════════════════════');
    log(`⏱️  Tempo total: ${Date.now() - inicioTotal}ms`);
    log(`📊 Sucessos: ${resultados.filter(r => r.status === 'SUCESSO').length}`);
    log(`❌ Falhas: ${resultados.filter(r => r.status === 'FALHA').length}`);
    log(`⚠️  Avisos: ${resultados.filter(r => r.status === 'AVISO').length}`);

  } catch (error) {
    log(`\n❌ ERRO FATAL: ${error}`);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
