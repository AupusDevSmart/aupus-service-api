/**
 * Script de Teste Automatizado COMPLETO - Fluxo de Ordens de Serviço
 *
 * Testa TODAS as rotas da API usando dados reais do banco
 *
 * Configuração correta:
 * - Porta: 3001
 * - Prefixo: /api/v1
 * - Total de rotas: 54+
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3000/api/v1'; // ✅ CORRIGIDO: porta 3000 + prefixo /api/v1

// Credenciais de autenticação
const AUTH_CREDENTIALS = {
  email: 'pjlunardelli@hotmail.com',
  senha: 'Aupus123!'
};

// Token JWT (será preenchido após login)
let AUTH_TOKEN: string | null = null;

// Carregar dados reais extraídos
const dadosReais = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'scripts-teste', 'dados-extraidos.json'), 'utf-8')
);

interface TesteResultado {
  modulo: string;
  teste: string;
  rota: string;
  metodo: string;
  status: 'SUCESSO' | 'FALHA' | 'AVISO' | 'SKIP';
  detalhes: string;
  erro?: any;
  tempo: number;
  statusCode?: number;
}

const resultados: TesteResultado[] = [];

function log(mensagem: string) {
  console.log(`[${new Date().toISOString()}] ${mensagem}`);
}

function registrarResultado(resultado: TesteResultado) {
  resultados.push(resultado);
  const emoji = resultado.status === 'SUCESSO' ? '✅' :
                resultado.status === 'FALHA' ? '❌' :
                resultado.status === 'SKIP' ? '⏭️' : '⚠️';
  log(`${emoji} [${resultado.modulo}] ${resultado.metodo} ${resultado.rota} - ${resultado.status} (${resultado.tempo}ms)`);
  if (resultado.detalhes) {
    log(`   └─ ${resultado.detalhes}`);
  }
  if (resultado.erro && resultado.status === 'FALHA') {
    const erroMsg = resultado.erro?.message || JSON.stringify(resultado.erro).substring(0, 100);
    log(`   └─ Erro: ${erroMsg}`);
  }
}

/**
 * Realiza login e obtém o token JWT
 */
async function fazerLogin(): Promise<string> {
  try {
    log('\n🔐 Realizando login...');
    const response = await axios.post(`${API_URL}/auth/login`, AUTH_CREDENTIALS);

    // A resposta vem em response.data.data (envelope padrão da API)
    const authData = response.data.data;
    const token = authData.access_token;

    log(`✅ Login realizado com sucesso!`);
    log(`   └─ Usuário: ${authData.user?.nome || authData.user?.email}`);
    log(`   └─ Role: ${authData.user?.roles?.[0] || 'N/A'}`);
    log(`   └─ Permissões: ${authData.user?.all_permissions?.length || 0}`);

    return token;
  } catch (error: any) {
    log(`❌ ERRO ao fazer login: ${error.response?.data?.error?.message || error.message}`);
    throw new Error('Falha na autenticação. Verifique as credenciais.');
  }
}

async function testarAPI(metodo: string, endpoint: string, dados?: any): Promise<any> {
  try {
    const config: any = {
      method: metodo,
      url: `${API_URL}${endpoint}`,
      timeout: 10000,
      headers: {}
    };

    // Adicionar token de autenticação se disponível
    if (AUTH_TOKEN) {
      config.headers.Authorization = `Bearer ${AUTH_TOKEN}`;
    }

    if (dados) {
      config.data = dados;
    }

    const response = await axios(config);
    return {
      sucesso: true,
      data: response.data?.data || response.data,
      status: response.status,
      total: response.data?.total
    };
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

  // Teste 1: Listar planos
  let teste1Inicio = Date.now();
  const listar = await testarAPI('GET', '/planos-manutencao');
  registrarResultado({
    modulo: 'Planos',
    teste: 'Listar planos',
    rota: '/planos-manutencao',
    metodo: 'GET',
    status: listar.sucesso ? 'SUCESSO' : 'FALHA',
    detalhes: listar.sucesso ? `${listar.total || 0} planos encontrados` : 'Falha ao listar',
    erro: listar.erro,
    tempo: Date.now() - teste1Inicio,
    statusCode: listar.status,
  });

  // Teste 2: Dashboard de planos
  teste1Inicio = Date.now();
  const dashboard = await testarAPI('GET', '/planos-manutencao/dashboard');
  registrarResultado({
    modulo: 'Planos',
    teste: 'Obter dashboard',
    rota: '/planos-manutencao/dashboard',
    metodo: 'GET',
    status: dashboard.sucesso ? 'SUCESSO' : 'FALHA',
    detalhes: dashboard.sucesso ? 'Dashboard obtido' : 'Falha ao obter dashboard',
    erro: dashboard.erro,
    tempo: Date.now() - teste1Inicio,
    statusCode: dashboard.status,
  });

  // Teste 3: Buscar plano por ID
  if (dadosReais.planos?.length > 0) {
    const planoId = dadosReais.planos[0].id;
    teste1Inicio = Date.now();
    const buscar = await testarAPI('GET', `/planos-manutencao/${planoId}`);
    registrarResultado({
      modulo: 'Planos',
      teste: 'Buscar por ID',
      rota: `/planos-manutencao/${planoId}`,
      metodo: 'GET',
      status: buscar.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: buscar.sucesso ? `Plano: ${buscar.data?.nome}` : 'Plano não encontrado',
      erro: buscar.erro,
      tempo: Date.now() - teste1Inicio,
      statusCode: buscar.status,
    });

    // Teste 4: Buscar resumo do plano
    teste1Inicio = Date.now();
    const resumo = await testarAPI('GET', `/planos-manutencao/${planoId}/resumo`);
    registrarResultado({
      modulo: 'Planos',
      teste: 'Obter resumo do plano',
      rota: `/planos-manutencao/${planoId}/resumo`,
      metodo: 'GET',
      status: resumo.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: resumo.sucesso ? 'Resumo obtido' : 'Falha ao obter resumo',
      erro: resumo.erro,
      tempo: Date.now() - teste1Inicio,
      statusCode: resumo.status,
    });

    // Teste 5: Buscar por equipamento
    if (dadosReais.planos[0].equipamento_id) {
      teste1Inicio = Date.now();
      const porEquip = await testarAPI('GET', `/planos-manutencao/por-equipamento/${dadosReais.planos[0].equipamento_id}`);
      registrarResultado({
        modulo: 'Planos',
        teste: 'Buscar por equipamento',
        rota: `/planos-manutencao/por-equipamento/${dadosReais.planos[0].equipamento_id}`,
        metodo: 'GET',
        status: porEquip.sucesso ? 'SUCESSO' : 'FALHA',
        detalhes: porEquip.sucesso ? 'Plano encontrado' : 'Falha ao buscar',
        erro: porEquip.erro,
        tempo: Date.now() - teste1Inicio,
        statusCode: porEquip.status,
      });
    }
  }

  // Teste 6: Buscar por planta
  if (dadosReais.plantas?.length > 0) {
    const plantaId = dadosReais.plantas[0].id;
    teste1Inicio = Date.now();
    const porPlanta = await testarAPI('GET', `/planos-manutencao/por-planta/${plantaId}`);
    registrarResultado({
      modulo: 'Planos',
      teste: 'Buscar por planta',
      rota: `/planos-manutencao/por-planta/${plantaId}`,
      metodo: 'GET',
      status: porPlanta.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: porPlanta.sucesso ? `${porPlanta.total || 0} planos na planta` : 'Falha ao buscar',
      erro: porPlanta.erro,
      tempo: Date.now() - teste1Inicio,
      statusCode: porPlanta.status,
    });
  }

  log(`\n⏱️  Tempo total: ${Date.now() - inicio}ms`);
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
  let teste1Inicio = Date.now();
  const listar = await testarAPI('GET', '/tarefas');
  registrarResultado({
    modulo: 'Tarefas',
    teste: 'Listar tarefas',
    rota: '/tarefas',
    metodo: 'GET',
    status: listar.sucesso ? 'SUCESSO' : 'FALHA',
    detalhes: listar.sucesso ? `${listar.total || 0} tarefas encontradas` : 'Falha ao listar',
    erro: listar.erro,
    tempo: Date.now() - teste1Inicio,
    statusCode: listar.status,
  });

  // Teste 2: Dashboard
  teste1Inicio = Date.now();
  const dashboard = await testarAPI('GET', '/tarefas/dashboard');
  registrarResultado({
    modulo: 'Tarefas',
    teste: 'Obter dashboard',
    rota: '/tarefas/dashboard',
    metodo: 'GET',
    status: dashboard.sucesso ? 'SUCESSO' : 'FALHA',
    detalhes: dashboard.sucesso ? 'Dashboard obtido' : 'Falha ao obter',
    erro: dashboard.erro,
    tempo: Date.now() - teste1Inicio,
    statusCode: dashboard.status,
  });

  // Teste 3: Buscar por ID
  if (dadosReais.tarefas?.length > 0) {
    const tarefaId = dadosReais.tarefas[0].id;
    teste1Inicio = Date.now();
    const buscar = await testarAPI('GET', `/tarefas/${tarefaId}`);
    registrarResultado({
      modulo: 'Tarefas',
      teste: 'Buscar por ID',
      rota: `/tarefas/${tarefaId}`,
      metodo: 'GET',
      status: buscar.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: buscar.sucesso ? `Tarefa: ${buscar.data?.descricao}` : 'Tarefa não encontrada',
      erro: buscar.erro,
      tempo: Date.now() - teste1Inicio,
      statusCode: buscar.status,
    });

    // Teste 4: Listar anexos da tarefa
    teste1Inicio = Date.now();
    const anexos = await testarAPI('GET', `/tarefas/${tarefaId}/anexos`);
    registrarResultado({
      modulo: 'Tarefas',
      teste: 'Listar anexos',
      rota: `/tarefas/${tarefaId}/anexos`,
      metodo: 'GET',
      status: anexos.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: anexos.sucesso ? `${anexos.data?.length || 0} anexos` : 'Falha ao listar anexos',
      erro: anexos.erro,
      tempo: Date.now() - teste1Inicio,
      statusCode: anexos.status,
    });
  }

  // Teste 5: Listar por plano
  if (dadosReais.planos?.length > 0) {
    const planoId = dadosReais.planos[0].id;
    teste1Inicio = Date.now();
    const porPlano = await testarAPI('GET', `/tarefas/plano/${planoId}`);
    registrarResultado({
      modulo: 'Tarefas',
      teste: 'Listar por plano',
      rota: `/tarefas/plano/${planoId}`,
      metodo: 'GET',
      status: porPlano.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: porPlano.sucesso ? `${porPlano.data?.length || 0} tarefas no plano` : 'Falha ao listar',
      erro: porPlano.erro,
      tempo: Date.now() - teste1Inicio,
      statusCode: porPlano.status,
    });
  }

  // Teste 6: Listar por equipamento
  if (dadosReais.equipamentos?.length > 0) {
    const equipId = dadosReais.equipamentos[0].id;
    teste1Inicio = Date.now();
    const porEquip = await testarAPI('GET', `/tarefas/equipamento/${equipId}`);
    registrarResultado({
      modulo: 'Tarefas',
      teste: 'Listar por equipamento',
      rota: `/tarefas/equipamento/${equipId}`,
      metodo: 'GET',
      status: porEquip.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: porEquip.sucesso ? `${porEquip.data?.length || 0} tarefas` : 'Falha ao listar',
      erro: porEquip.erro,
      tempo: Date.now() - teste1Inicio,
      statusCode: porEquip.status,
    });
  }

  log(`\n⏱️  Tempo total: ${Date.now() - inicio}ms`);
}

// ==========================================
// TESTES DE ANOMALIAS
// ==========================================
async function testarAnomalias() {
  log('\n═══════════════════════════════════════');
  log('  TESTANDO ANOMALIAS');
  log('═══════════════════════════════════════');

  const inicio = Date.now();

  // Teste 1: Listar
  let teste1Inicio = Date.now();
  const listar = await testarAPI('GET', '/anomalias');
  registrarResultado({
    modulo: 'Anomalias',
    teste: 'Listar anomalias',
    rota: '/anomalias',
    metodo: 'GET',
    status: listar.sucesso ? 'SUCESSO' : 'FALHA',
    detalhes: listar.sucesso ? `${listar.total || 0} anomalias` : 'Falha ao listar',
    erro: listar.erro,
    tempo: Date.now() - teste1Inicio,
    statusCode: listar.status,
  });

  // Teste 2: Stats
  teste1Inicio = Date.now();
  const stats = await testarAPI('GET', '/anomalias/stats');
  registrarResultado({
    modulo: 'Anomalias',
    teste: 'Obter estatísticas',
    rota: '/anomalias/stats',
    metodo: 'GET',
    status: stats.sucesso ? 'SUCESSO' : 'FALHA',
    detalhes: stats.sucesso ? 'Estatísticas obtidas' : 'Falha ao obter',
    erro: stats.erro,
    tempo: Date.now() - teste1Inicio,
    statusCode: stats.status,
  });

  // Teste 3: Buscar por ID
  if (dadosReais.anomalias?.length > 0) {
    const anomaliaId = dadosReais.anomalias[0].id;
    teste1Inicio = Date.now();
    const buscar = await testarAPI('GET', `/anomalias/${anomaliaId}`);
    registrarResultado({
      modulo: 'Anomalias',
      teste: 'Buscar por ID',
      rota: `/anomalias/${anomaliaId}`,
      metodo: 'GET',
      status: buscar.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: buscar.sucesso ? `Anomalia: ${buscar.data?.descricao}` : 'Não encontrada',
      erro: buscar.erro,
      tempo: Date.now() - teste1Inicio,
      statusCode: buscar.status,
    });

    // Teste 4: Listar anexos
    teste1Inicio = Date.now();
    const anexos = await testarAPI('GET', `/anomalias/${anomaliaId}/anexos`);
    registrarResultado({
      modulo: 'Anomalias',
      teste: 'Listar anexos',
      rota: `/anomalias/${anomaliaId}/anexos`,
      metodo: 'GET',
      status: anexos.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: anexos.sucesso ? `${anexos.data?.length || 0} anexos` : 'Falha',
      erro: anexos.erro,
      tempo: Date.now() - teste1Inicio,
      statusCode: anexos.status,
    });
  }

  // Teste 5: Filtrar por status
  teste1Inicio = Date.now();
  const filtrar = await testarAPI('GET', '/anomalias?status=AGUARDANDO');
  registrarResultado({
    modulo: 'Anomalias',
    teste: 'Filtrar por status AGUARDANDO',
    rota: '/anomalias?status=AGUARDANDO',
    metodo: 'GET',
    status: filtrar.sucesso ? 'SUCESSO' : 'FALHA',
    detalhes: filtrar.sucesso ? `${filtrar.total || 0} aguardando` : 'Falha ao filtrar',
    erro: filtrar.erro,
    tempo: Date.now() - teste1Inicio,
    statusCode: filtrar.status,
  });

  // Teste 6-9: Selects
  const selects = ['plantas', 'unidades', 'equipamentos', 'usuarios'];
  for (const select of selects) {
    teste1Inicio = Date.now();
    const resultado = await testarAPI('GET', `/anomalias/selects/${select}`);
    registrarResultado({
      modulo: 'Anomalias',
      teste: `Select ${select}`,
      rota: `/anomalias/selects/${select}`,
      metodo: 'GET',
      status: resultado.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: resultado.sucesso ? `${resultado.data?.length || 0} itens` : 'Falha',
      erro: resultado.erro,
      tempo: Date.now() - teste1Inicio,
      statusCode: resultado.status,
    });
  }

  log(`\n⏱️  Tempo total: ${Date.now() - inicio}ms`);
}

// ==========================================
// TESTES DE PROGRAMAÇÃO OS
// ==========================================
async function testarProgramacoes() {
  log('\n═══════════════════════════════════════');
  log('  TESTANDO PROGRAMAÇÕES OS');
  log('═══════════════════════════════════════');

  const inicio = Date.now();

  // Teste 1: Listar
  let teste1Inicio = Date.now();
  const listar = await testarAPI('GET', '/programacao-os');
  registrarResultado({
    modulo: 'Programações',
    teste: 'Listar programações',
    rota: '/programacao-os',
    metodo: 'GET',
    status: listar.sucesso ? 'SUCESSO' : 'FALHA',
    detalhes: listar.sucesso ? `${listar.total || 0} programações` : 'Falha',
    erro: listar.erro,
    tempo: Date.now() - teste1Inicio,
    statusCode: listar.status,
  });

  // Teste 2: Buscar por ID
  if (dadosReais.programacoes?.length > 0) {
    const progId = dadosReais.programacoes[0].id;
    teste1Inicio = Date.now();
    const buscar = await testarAPI('GET', `/programacao-os/${progId}`);
    registrarResultado({
      modulo: 'Programações',
      teste: 'Buscar por ID',
      rota: `/programacao-os/${progId}`,
      metodo: 'GET',
      status: buscar.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: buscar.sucesso ? `Status: ${buscar.data?.status}` : 'Não encontrada',
      erro: buscar.erro,
      tempo: Date.now() - teste1Inicio,
      statusCode: buscar.status,
    });
  }

  // Teste 3: Filtrar por status
  const status = ['PENDENTE', 'EM_ANALISE', 'APROVADA', 'REJEITADA', 'CANCELADA'];
  for (const st of status) {
    teste1Inicio = Date.now();
    const filtrar = await testarAPI('GET', `/programacao-os?status=${st}`);
    registrarResultado({
      modulo: 'Programações',
      teste: `Filtrar status ${st}`,
      rota: `/programacao-os?status=${st}`,
      metodo: 'GET',
      status: filtrar.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: filtrar.sucesso ? `${filtrar.total || 0} com status ${st}` : 'Falha',
      erro: filtrar.erro,
      tempo: Date.now() - teste1Inicio,
      statusCode: filtrar.status,
    });
  }

  log(`\n⏱️  Tempo total: ${Date.now() - inicio}ms`);
}

// ==========================================
// TESTES DE EXECUÇÃO OS
// ==========================================
async function testarExecucaoOS() {
  log('\n═══════════════════════════════════════');
  log('  TESTANDO EXECUÇÃO OS');
  log('═══════════════════════════════════════');

  const inicio = Date.now();

  // Teste 1: Listar
  let teste1Inicio = Date.now();
  const listar = await testarAPI('GET', '/execucao-os');
  registrarResultado({
    modulo: 'Execução OS',
    teste: 'Listar OS',
    rota: '/execucao-os',
    metodo: 'GET',
    status: listar.sucesso ? 'SUCESSO' : 'FALHA',
    detalhes: listar.sucesso ? `${listar.total || 0} ordens de serviço` : 'Falha',
    erro: listar.erro,
    tempo: Date.now() - teste1Inicio,
    statusCode: listar.status,
  });

  // Teste 2: Buscar por ID
  if (dadosReais.ordensServico?.length > 0) {
    const osId = dadosReais.ordensServico[0].id;
    teste1Inicio = Date.now();
    const buscar = await testarAPI('GET', `/execucao-os/${osId}`);
    registrarResultado({
      modulo: 'Execução OS',
      teste: 'Buscar por ID',
      rota: `/execucao-os/${osId}`,
      metodo: 'GET',
      status: buscar.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: buscar.sucesso ? `OS ${buscar.data?.numero_os} - Status: ${buscar.data?.status}` : 'Não encontrada',
      erro: buscar.erro,
      tempo: Date.now() - teste1Inicio,
      statusCode: buscar.status,
    });

    // Teste 3: Listar tarefas da OS
    teste1Inicio = Date.now();
    const tarefas = await testarAPI('GET', `/execucao-os/${osId}/tarefas`);
    registrarResultado({
      modulo: 'Execução OS',
      teste: 'Listar tarefas da OS',
      rota: `/execucao-os/${osId}/tarefas`,
      metodo: 'GET',
      status: tarefas.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: tarefas.sucesso ? `${tarefas.data?.length || 0} tarefas` : 'Falha',
      erro: tarefas.erro,
      tempo: Date.now() - teste1Inicio,
      statusCode: tarefas.status,
    });

    // Teste 4: Listar anexos
    teste1Inicio = Date.now();
    const anexos = await testarAPI('GET', `/execucao-os/${osId}/anexos`);
    registrarResultado({
      modulo: 'Execução OS',
      teste: 'Listar anexos',
      rota: `/execucao-os/${osId}/anexos`,
      metodo: 'GET',
      status: anexos.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: anexos.sucesso ? `${anexos.data?.length || 0} anexos` : 'Falha',
      erro: anexos.erro,
      tempo: Date.now() - teste1Inicio,
      statusCode: anexos.status,
    });

    // Teste 5: Relatório
    teste1Inicio = Date.now();
    const relatorio = await testarAPI('GET', `/execucao-os/${osId}/relatorio`);
    registrarResultado({
      modulo: 'Execução OS',
      teste: 'Gerar relatório',
      rota: `/execucao-os/${osId}/relatorio`,
      metodo: 'GET',
      status: relatorio.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: relatorio.sucesso ? 'Relatório gerado' : 'Falha ao gerar',
      erro: relatorio.erro,
      tempo: Date.now() - teste1Inicio,
      statusCode: relatorio.status,
    });
  }

  // Teste 6: Filtrar por status
  const status = ['PLANEJADA', 'PROGRAMADA', 'EM_EXECUCAO', 'PAUSADA', 'FINALIZADA', 'CANCELADA'];
  for (const st of status) {
    teste1Inicio = Date.now();
    const filtrar = await testarAPI('GET', `/execucao-os?status=${st}`);
    registrarResultado({
      modulo: 'Execução OS',
      teste: `Filtrar status ${st}`,
      rota: `/execucao-os?status=${st}`,
      metodo: 'GET',
      status: filtrar.sucesso ? 'SUCESSO' : 'FALHA',
      detalhes: filtrar.sucesso ? `${filtrar.total || 0} OS com status ${st}` : 'Falha',
      erro: filtrar.erro,
      tempo: Date.now() - teste1Inicio,
      statusCode: filtrar.status,
    });
  }

  log(`\n⏱️  Tempo total: ${Date.now() - inicio}ms`);
}

// ==========================================
// VERIFICAÇÃO DE BANCO
// ==========================================
async function verificarBanco() {
  log('\n═══════════════════════════════════════');
  log('  VERIFICANDO BANCO DE DADOS');
  log('═══════════════════════════════════════');

  const inicio = Date.now();

  try {
    const [planos, tarefas, anomalias, programacoes, os] = await Promise.all([
      prisma.planos_manutencao.count({ where: { deleted_at: null } }),
      prisma.tarefas.count({ where: { deleted_at: null } }),
      prisma.anomalias.count({ where: { deleted_at: null } }),
      prisma.programacoes_os.count(),
      prisma.ordens_servico.count(),
    ]);

    registrarResultado({
      modulo: 'Banco',
      teste: 'Verificar integridade',
      rota: 'N/A',
      metodo: 'PRISMA',
      status: 'SUCESSO',
      detalhes: `Planos:${planos}, Tarefas:${tarefas}, Anomalias:${anomalias}, Prog:${programacoes}, OS:${os}`,
      tempo: Date.now() - inicio,
    });
  } catch (error) {
    registrarResultado({
      modulo: 'Banco',
      teste: 'Verificar integridade',
      rota: 'N/A',
      metodo: 'PRISMA',
      status: 'FALHA',
      detalhes: 'Erro ao acessar banco',
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
  log('  GERANDO RELATÓRIO COMPLETO');
  log('═══════════════════════════════════════');

  const sucessos = resultados.filter(r => r.status === 'SUCESSO').length;
  const falhas = resultados.filter(r => r.status === 'FALHA').length;
  const avisos = resultados.filter(r => r.status === 'AVISO').length;
  const skips = resultados.filter(r => r.status === 'SKIP').length;
  const total = resultados.length;

  // Agrupar por módulo
  const porModulo = resultados.reduce((acc, r) => {
    if (!acc[r.modulo]) {
      acc[r.modulo] = { sucessos: 0, falhas: 0, avisos: 0, skips: 0, total: 0 };
    }
    acc[r.modulo].total++;
    if (r.status === 'SUCESSO') acc[r.modulo].sucessos++;
    if (r.status === 'FALHA') acc[r.modulo].falhas++;
    if (r.status === 'AVISO') acc[r.modulo].avisos++;
    if (r.status === 'SKIP') acc[r.modulo].skips++;
    return acc;
  }, {} as any);

  const relatorio = `
# Relatório de Testes COMPLETO - Fluxo de Ordens de Serviço

**Data:** ${new Date().toLocaleString('pt-BR')}
**Total de Testes:** ${total}
**Configuração:** http://localhost:3001/api/v1

## 📊 Resumo Geral

| Métrica | Valor | Percentual |
|---------|-------|------------|
| ✅ **Sucessos** | ${sucessos} | ${((sucessos/total)*100).toFixed(1)}% |
| ❌ **Falhas** | ${falhas} | ${((falhas/total)*100).toFixed(1)}% |
| ⚠️ **Avisos** | ${avisos} | ${((avisos/total)*100).toFixed(1)}% |
| ⏭️ **Skips** | ${skips} | ${((skips/total)*100).toFixed(1)}% |

${sucessos === total ? '## 🎉 TODOS OS TESTES PASSARAM!' : falhas > 0 ? '## ⚠️ ALGUNS TESTES FALHARAM' : ''}

## 📋 Resultados por Módulo

${Object.entries(porModulo).map(([modulo, stats]: [string, any]) => `
### ${modulo}
- Total: ${stats.total} testes
- ✅ Sucessos: ${stats.sucessos} (${((stats.sucessos/stats.total)*100).toFixed(1)}%)
- ❌ Falhas: ${stats.falhas} (${((stats.falhas/stats.total)*100).toFixed(1)}%)
- ⚠️ Avisos: ${stats.avisos}
- ⏭️ Skips: ${stats.skips}
`).join('\n')}

## 📝 Detalhes de Todos os Testes

${resultados.map((r, i) => `
### ${i + 1}. ${r.modulo} - ${r.teste}

- **Status:** ${r.status === 'SUCESSO' ? '✅ SUCESSO' : r.status === 'FALHA' ? '❌ FALHA' : r.status === 'SKIP' ? '⏭️ SKIP' : '⚠️ AVISO'}
- **Método:** ${r.metodo}
- **Rota:** \`${r.rota}\`
- **Tempo:** ${r.tempo}ms
- **HTTP Status:** ${r.statusCode || 'N/A'}
- **Detalhes:** ${r.detalhes}
${r.erro ? `- **Erro:** \`\`\`\n${JSON.stringify(r.erro, null, 2).substring(0, 500)}\n\`\`\`` : ''}
`).join('\n')}

## 🔍 Análise

${gerarAnalise()}

## 📌 Recomendações

${gerarRecomendacoes()}

---
**Relatório gerado automaticamente pelo script testar-fluxo-os-completo.ts**
**Configuração: localhost:3001/api/v1**
`;

  const outputPath = path.join(__dirname, '..', '..', '..', 'RELATORIO-TESTES-COMPLETO.md');
  fs.writeFileSync(outputPath, relatorio);

  log(`\n📄 Relatório salvo em: ${outputPath}`);

  return relatorio;
}

function gerarAnalise() {
  const falhas = resultados.filter(r => r.status === 'FALHA');

  if (falhas.length === 0) {
    return '✅ **Todos os testes passaram com sucesso!** O sistema está funcionando perfeitamente.';
  }

  const analises = [];

  // Analisar falhas por código HTTP
  const falhas404 = falhas.filter(f => f.statusCode === 404);
  const falhas500 = falhas.filter(f => f.statusCode === 500);
  const falhas403 = falhas.filter(f => f.statusCode === 403);

  if (falhas404.length > 0) {
    analises.push(`- **${falhas404.length} rotas retornaram 404 (Não Encontradas)** - Pode indicar endpoints não implementados ou IDs inválidos.`);
  }
  if (falhas500.length > 0) {
    analises.push(`- **${falhas500.length} rotas retornaram 500 (Erro Interno)** - Indica problemas no código do backend.`);
  }
  if (falhas403.length > 0) {
    analises.push(`- **${falhas403.length} rotas retornaram 403 (Proibido)** - Pode ser problema de autenticação/autorização.`);
  }

  return analises.join('\n');
}

function gerarRecomendacoes() {
  const falhas = resultados.filter(r => r.status === 'FALHA');

  if (falhas.length === 0) {
    return `
1. ✅ Implementar testes de mutação (POST, PUT, DELETE)
2. ✅ Testar autenticação JWT
3. ✅ Testar casos de erro propositalmente
4. ✅ Implementar testes E2E do fluxo completo`;
  }

  return `
1. ❌ Corrigir as ${falhas.length} falhas identificadas
2. ⚠️ Verificar logs do backend para entender erros 500
3. 📝 Verificar se IDs dos dados reais ainda existem no banco
4. 🔄 Re-executar testes após correções`;
}

// ==========================================
// MAIN
// ==========================================
async function main() {
  const inicioTotal = Date.now();

  log('═══════════════════════════════════════════════════════════');
  log('  TESTES AUTOMATIZADOS COMPLETOS - FLUXO OS');
  log('═══════════════════════════════════════════════════════════');
  log(`API URL: ${API_URL}`);
  log(`Dados reais: ${Object.keys(dadosReais).length} entidades`);

  try {
    // Fazer login e obter token JWT
    AUTH_TOKEN = await fazerLogin();

    await verificarBanco();
    await testarPlanos();
    await testarTarefas();
    await testarAnomalias();
    await testarProgramacoes();
    await testarExecucaoOS();

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
