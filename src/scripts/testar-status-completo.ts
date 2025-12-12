/**
 * Script COMPLETO E DEFINITIVO de testes de mudança de status
 * Testa Programação OS e Execução OS
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const API_URL = 'http://localhost:3000/api/v1';
const AUTH_CREDENTIALS = {
  email: 'pjlunardelli@hotmail.com',
  senha: 'Aupus123!'
};

let AUTH_TOKEN: string | null = null;

const dadosReais = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'scripts-teste', 'dados-extraidos.json'), 'utf-8')
);

interface TesteResultado {
  endpoint: string;
  metodo: string;
  status: 'SUCESSO' | 'FALHA';
  statusCode?: number;
  tempo: number;
  detalhes: string;
  erro?: any;
}

const resultados: TesteResultado[] = [];

async function fazerLogin(): Promise<string> {
  const response = await axios.post(`${API_URL}/auth/login`, AUTH_CREDENTIALS, { timeout: 10000 });
  const authData = response.data.data;
  console.log(`\n✅ Login: ${authData.user?.nome}`);
  return authData.access_token;
}

async function testarAPI(metodo: string, endpoint: string, dados?: any): Promise<any> {
  const inicio = Date.now();
  try {
    const response = await axios({
      method: metodo,
      url: `${API_URL}${endpoint}`,
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      data: dados,
      timeout: 15000
    });
    return { sucesso: true, data: response.data?.data || response.data, status: response.status, tempo: Date.now() - inicio };
  } catch (error: any) {
    return { sucesso: false, erro: error.response?.data || error.message, status: error.response?.status || 500, tempo: Date.now() - inicio };
  }
}

function registrar(resultado: TesteResultado) {
  resultados.push(resultado);
  const emoji = resultado.status === 'SUCESSO' ? '✅' : '❌';
  console.log(`${emoji} ${resultado.metodo} ${resultado.endpoint} - ${resultado.status} (${resultado.tempo}ms)`);
  if (resultado.detalhes) console.log(`   └─ ${resultado.detalhes}`);
  if (resultado.erro && resultado.status === 'FALHA') {
    const erroMsg = typeof resultado.erro === 'object'
      ? JSON.stringify(resultado.erro).substring(0, 150)
      : String(resultado.erro).substring(0, 150);
    console.log(`   └─ ${erroMsg}`);
  }
}

async function testarProgramacaoOS() {
  console.log('\n═══════════════════════════════════════');
  console.log('  PROGRAMAÇÃO OS - MUDANÇAS DE STATUS');
  console.log('═══════════════════════════════════════\n');

  // Criar programação a partir de tarefas
  const tarefaId = dadosReais.tarefas[0]?.id;
  if (!tarefaId) {
    console.log('⚠️  Sem tarefas disponíveis\n');
    return;
  }

  console.log(`📋 Criando programação com tarefa: ${tarefaId}\n`);

  const criar = await testarAPI('POST', '/programacao-os/from-tarefas', {
    tarefas_ids: [tarefaId],
    descricao: 'Programação de teste automatizado',
    prioridade: 'MEDIA'
  });

  if (!criar.sucesso) {
    console.log('❌ Falha ao criar programação. Pulando testes de Programação OS.\n');
    return;
  }

  const progId = criar.data.id;
  console.log(`✅ Programação criada: ${progId}\n`);

  // Teste 1: Analisar
  const analisar = await testarAPI('PATCH', `/programacao-os/${progId}/analisar`, {
    observacoes_analise: 'Teste automatizado'
  });
  registrar({
    endpoint: `/programacao-os/:id/analisar`,
    metodo: 'PATCH',
    status: analisar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: analisar.status,
    tempo: analisar.tempo,
    detalhes: analisar.sucesso ? 'PENDENTE → EM_ANALISE' : 'Falha',
    erro: analisar.erro
  });

  if (!analisar.sucesso) return;

  // Teste 2: Aprovar
  const aprovar = await testarAPI('PATCH', `/programacao-os/${progId}/aprovar`, {
    observacoes_aprovacao: 'Aprovado'
  });
  registrar({
    endpoint: `/programacao-os/:id/aprovar`,
    metodo: 'PATCH',
    status: aprovar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: aprovar.status,
    tempo: aprovar.tempo,
    detalhes: aprovar.sucesso ? 'EM_ANALISE → APROVADA (OS criada)' : 'Falha',
    erro: aprovar.erro
  });

  // Teste 3: Rejeitar (nova programação)
  const criar2 = await testarAPI('POST', '/programacao-os/from-tarefas', {
    tarefas_ids: [tarefaId],
    descricao: 'Programação teste rejeição'
  });

  if (criar2.sucesso) {
    await testarAPI('PATCH', `/programacao-os/${criar2.data.id}/analisar`, {});

    const rejeitar = await testarAPI('PATCH', `/programacao-os/${criar2.data.id}/rejeitar`, {
      motivo_rejeicao: 'Falta de recursos'
    });
    registrar({
      endpoint: `/programacao-os/:id/rejeitar`,
      metodo: 'PATCH',
      status: rejeitar.sucesso ? 'SUCESSO' : 'FALHA',
      statusCode: rejeitar.status,
      tempo: rejeitar.tempo,
      detalhes: rejeitar.sucesso ? 'EM_ANALISE → REJEITADA' : 'Falha',
      erro: rejeitar.erro
    });
  }

  // Teste 4: Cancelar (nova programação)
  const criar3 = await testarAPI('POST', '/programacao-os/from-tarefas', {
    tarefas_ids: [tarefaId],
    descricao: 'Programação teste cancelamento'
  });

  if (criar3.sucesso) {
    const cancelar = await testarAPI('PATCH', `/programacao-os/${criar3.data.id}/cancelar`, {
      motivo_cancelamento: 'Teste'
    });
    registrar({
      endpoint: `/programacao-os/:id/cancelar`,
      metodo: 'PATCH',
      status: cancelar.sucesso ? 'SUCESSO' : 'FALHA',
      statusCode: cancelar.status,
      tempo: cancelar.tempo,
      detalhes: cancelar.sucesso ? 'PENDENTE → CANCELADA' : 'Falha',
      erro: cancelar.erro
    });
  }

  return aprovar.data?.ordem_servico_id;
}

async function testarExecucaoOS(osId?: string) {
  console.log('\n═══════════════════════════════════════');
  console.log('  EXECUÇÃO OS - MUDANÇAS DE STATUS');
  console.log('═══════════════════════════════════════\n');

  if (!osId) {
    const buscar = await testarAPI('GET', '/execucao-os?status=PLANEJADA&limit=1');
    if (!buscar.sucesso || !buscar.data?.data || buscar.data.data.length === 0) {
      console.log('⚠️  Nenhuma OS PLANEJADA disponível\n');
      return;
    }
    osId = buscar.data.data[0].id;
  }

  console.log(`📋 Testando OS: ${osId}\n`);

  // Teste 1: Programar
  const programar = await testarAPI('PATCH', `/execucao-os/${osId}/programar`, {
    data_hora_programada: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    responsavel: 'Técnico Teste',
    materiais_confirmados: [],
    ferramentas_confirmadas: [],
    tecnicos_confirmados: []
  });
  registrar({
    endpoint: `/execucao-os/:id/programar`,
    metodo: 'PATCH',
    status: programar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: programar.status,
    tempo: programar.tempo,
    detalhes: programar.sucesso ? 'PLANEJADA → PROGRAMADA' : 'Falha',
    erro: programar.erro
  });

  if (!programar.sucesso) return;

  // Teste 2: Iniciar
  const iniciar = await testarAPI('PATCH', `/execucao-os/${osId}/iniciar`, {
    equipe_presente: ['Técnico 1'],
    responsavel_execucao: 'Técnico Teste'
  });
  registrar({
    endpoint: `/execucao-os/:id/iniciar`,
    metodo: 'PATCH',
    status: iniciar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: iniciar.status,
    tempo: iniciar.tempo,
    detalhes: iniciar.sucesso ? 'PROGRAMADA → EM_EXECUCAO' : 'Falha',
    erro: iniciar.erro
  });

  if (!iniciar.sucesso) return;

  // Teste 3: Pausar
  const pausar = await testarAPI('PATCH', `/execucao-os/${osId}/pausar`, {
    motivo_pausa: 'Pausa para almoço'
  });
  registrar({
    endpoint: `/execucao-os/:id/pausar`,
    metodo: 'PATCH',
    status: pausar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: pausar.status,
    tempo: pausar.tempo,
    detalhes: pausar.sucesso ? 'EM_EXECUCAO → PAUSADA' : 'Falha',
    erro: pausar.erro
  });

  if (!pausar.sucesso) return;

  // Teste 4: Retomar
  const retomar = await testarAPI('PATCH', `/execucao-os/${osId}/retomar`, {
    observacoes_retomada: 'Trabalhos retomados'
  });
  registrar({
    endpoint: `/execucao-os/:id/retomar`,
    metodo: 'PATCH',
    status: retomar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: retomar.status,
    tempo: retomar.tempo,
    detalhes: retomar.sucesso ? 'PAUSADA → EM_EXECUCAO' : 'Falha',
    erro: retomar.erro
  });

  if (!retomar.sucesso) return;

  // Teste 5: Finalizar
  const finalizar = await testarAPI('PATCH', `/execucao-os/${osId}/finalizar`, {
    resultado_servico: 'Serviço concluído',
    materiais_consumidos: [],
    ferramentas_utilizadas: [],
    avaliacao_qualidade: 5
  });
  registrar({
    endpoint: `/execucao-os/:id/finalizar`,
    metodo: 'PATCH',
    status: finalizar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: finalizar.status,
    tempo: finalizar.tempo,
    detalhes: finalizar.sucesso ? 'EM_EXECUCAO → FINALIZADA' : 'Falha',
    erro: finalizar.erro
  });

  // Teste 6: Cancelar (outra OS)
  const buscar = await testarAPI('GET', '/execucao-os?status=PLANEJADA&limit=1');
  if (buscar.sucesso && buscar.data?.data?.length > 0) {
    const osId2 = buscar.data.data[0].id;
    const cancelar = await testarAPI('PATCH', `/execucao-os/${osId2}/cancelar`, {
      motivo_cancelamento: 'Equipamento inoperante'
    });
    registrar({
      endpoint: `/execucao-os/:id/cancelar`,
      metodo: 'PATCH',
      status: cancelar.sucesso ? 'SUCESSO' : 'FALHA',
      statusCode: cancelar.status,
      tempo: cancelar.tempo,
      detalhes: cancelar.sucesso ? 'PLANEJADA → CANCELADA' : 'Falha',
      erro: cancelar.erro
    });
  }
}

function gerarRelatorio() {
  console.log('\n═══════════════════════════════════════');
  console.log('  RESUMO FINAL');
  console.log('═══════════════════════════════════════\n');

  const sucessos = resultados.filter(r => r.status === 'SUCESSO').length;
  const falhas = resultados.filter(r => r.status === 'FALHA').length;
  const total = resultados.length;

  console.log(`📊 Total: ${total}`);
  console.log(`✅ Sucessos: ${sucessos} (${((sucessos/total)*100).toFixed(1)}%)`);
  console.log(`❌ Falhas: ${falhas} (${((falhas/total)*100).toFixed(1)}%)`);

  if (falhas > 0) {
    console.log('\n❌ FALHAS:\n');
    resultados.filter(r => r.status === 'FALHA').forEach(r => {
      console.log(`  • ${r.metodo} ${r.endpoint}`);
    });
  }

  if (sucessos === total && total > 0) {
    console.log('\n🎉 100% DE SUCESSO!\n');
  }
}

async function main() {
  try {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  TESTES COMPLETOS DE MUDANÇAS DE STATUS');
    console.log('═══════════════════════════════════════════════════════════');

    AUTH_TOKEN = await fazerLogin();

    const osId = await testarProgramacaoOS();
    await testarExecucaoOS(osId);

    gerarRelatorio();

    console.log('✅ CONCLUÍDO!\n');
  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message);
    process.exit(1);
  }
}

main();
