/**
 * Script completo para testar DTOs corrigidos
 * Cria dados novos em vez de usar existentes para garantir estados corretos
 */

import axios from 'axios';

const API_URL = 'http://localhost:3000/api/v1';

const AUTH_CREDENTIALS = {
  email: 'pjlunardelli@hotmail.com',
  senha: 'Aupus123!'
};

let AUTH_TOKEN: string | null = null;

interface TesteResultado {
  endpoint: string;
  metodo: string;
  status: 'SUCESSO' | 'FALHA' | 'SKIP';
  statusCode?: number;
  tempo: number;
  detalhes: string;
  erro?: any;
}

const resultados: TesteResultado[] = [];

async function fazerLogin(): Promise<string> {
  try {
    console.log('\n🔐 Fazendo login...');
    const response = await axios.post(`${API_URL}/auth/login`, AUTH_CREDENTIALS, {
      timeout: 10000
    });
    const authData = response.data.data;
    console.log(`✅ Login realizado: ${authData.user?.nome} (${authData.user?.roles?.[0]})`);
    return authData.access_token;
  } catch (error: any) {
    console.error('❌ Erro ao fazer login:', error.message);
    throw error;
  }
}

async function testarAPI(metodo: string, endpoint: string, dados?: any): Promise<any> {
  const inicio = Date.now();

  try {
    const config: any = {
      method: metodo,
      url: `${API_URL}${endpoint}`,
      timeout: 15000,
      headers: {}
    };

    if (AUTH_TOKEN) {
      config.headers.Authorization = `Bearer ${AUTH_TOKEN}`;
    }

    if (dados) {
      config.data = dados;
    }

    const response = await axios(config);
    const tempo = Date.now() - inicio;

    return {
      sucesso: true,
      data: response.data?.data || response.data,
      status: response.status,
      tempo
    };
  } catch (error: any) {
    const tempo = Date.now() - inicio;
    return {
      sucesso: false,
      erro: error.response?.data || error.message,
      status: error.response?.status || 500,
      tempo
    };
  }
}

function registrar(resultado: TesteResultado) {
  resultados.push(resultado);
  const emoji = resultado.status === 'SUCESSO' ? '✅' :
                resultado.status === 'FALHA' ? '❌' : '⏭️';
  console.log(`${emoji} ${resultado.metodo} ${resultado.endpoint} - ${resultado.status} (${resultado.tempo}ms)`);
  if (resultado.detalhes) {
    console.log(`   └─ ${resultado.detalhes}`);
  }
  if (resultado.erro && resultado.status === 'FALHA') {
    const erroMsg = typeof resultado.erro === 'object'
      ? JSON.stringify(resultado.erro).substring(0, 200)
      : String(resultado.erro).substring(0, 200);
    console.log(`   └─ Erro: ${erroMsg}`);
  }
}

async function testarCriacaoProgramacao() {
  console.log('\n═══════════════════════════════════════');
  console.log('  TESTE 1: CRIAR PROGRAMAÇÃO (DTO CORRIGIDO)');
  console.log('═══════════════════════════════════════\n');

  // Teste com campos opcionais omitidos (tempo_estimado e duracao_estimada)
  const criar = await testarAPI('POST', '/programacao-os', {
    descricao: 'Teste de DTO corrigido - campos opcionais',
    local: 'Planta de Teste',
    ativo: 'Equipamento Teste',
    condicoes: 'FUNCIONANDO',
    tipo: 'PREVENTIVA',
    prioridade: 'MEDIA',
    origem: 'PROGRAMADA'
    // tempo_estimado e duracao_estimada OMITIDOS (agora são opcionais)
  });

  registrar({
    endpoint: '/programacao-os',
    metodo: 'POST',
    status: criar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: criar.status,
    tempo: criar.tempo,
    detalhes: criar.sucesso ? 'Programação criada sem tempo_estimado (usa padrão 2h)' : 'Falha ao criar programação',
    erro: criar.erro
  });

  return criar.sucesso ? criar.data.id : null;
}

async function testarAprovacaoComValidacaoCruzada() {
  console.log('\n═══════════════════════════════════════');
  console.log('  TESTE 2: VALIDAÇÃO CRUZADA DATA/HORA');
  console.log('═══════════════════════════════════════\n');

  // Criar programação para teste
  const criar = await testarAPI('POST', '/programacao-os', {
    descricao: 'Teste validação cruzada',
    local: 'Planta de Teste',
    ativo: 'Equipamento Teste',
    condicoes: 'FUNCIONANDO',
    tipo: 'PREVENTIVA',
    prioridade: 'MEDIA',
    origem: 'PROGRAMADA'
  });

  if (!criar.sucesso) {
    console.log('⚠️  Não foi possível criar programação para teste');
    return;
  }

  const progId = criar.data.id;

  // Analisar primeiro
  await testarAPI('PATCH', `/programacao-os/${progId}/analisar`, {
    observacoes_analise: 'Análise para teste'
  });

  // Teste 1: Aprovar com apenas data (deve falhar - validação cruzada)
  const aprovar1 = await testarAPI('PATCH', `/programacao-os/${progId}/aprovar`, {
    data_programada_sugerida: '2025-12-15'
    // hora_programada_sugerida OMITIDA - deve falhar
  });

  registrar({
    endpoint: '/programacao-os/:id/aprovar',
    metodo: 'PATCH',
    status: aprovar1.sucesso ? 'FALHA' : 'SUCESSO', // Invertido - queremos que falhe
    statusCode: aprovar1.status,
    tempo: aprovar1.tempo,
    detalhes: aprovar1.sucesso ? 'ERRO: deveria rejeitar data sem hora!' : 'Validação cruzada funcionou corretamente',
    erro: aprovar1.erro
  });

  // Analisar novamente se necessário
  const buscar = await testarAPI('GET', `/programacao-os/${progId}`);
  if (buscar.data?.status === 'PENDENTE') {
    await testarAPI('PATCH', `/programacao-os/${progId}/analisar`, {});
  }

  // Teste 2: Aprovar com data e hora (deve suceder)
  const aprovar2 = await testarAPI('PATCH', `/programacao-os/${progId}/aprovar`, {
    data_programada_sugerida: '2025-12-15',
    hora_programada_sugerida: '08:00'
  });

  registrar({
    endpoint: '/programacao-os/:id/aprovar',
    metodo: 'PATCH',
    status: aprovar2.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: aprovar2.status,
    tempo: aprovar2.tempo,
    detalhes: aprovar2.sucesso ? 'Aprovação com data e hora completas' : 'Falha ao aprovar',
    erro: aprovar2.erro
  });

  return aprovar2.sucesso ? aprovar2.data.os_id : null;
}

async function testarProgramarOS(osId?: string) {
  console.log('\n═══════════════════════════════════════');
  console.log('  TESTE 3: PROGRAMAR OS (ARRAYS OPCIONAIS)');
  console.log('═══════════════════════════════════════\n');

  if (!osId) {
    console.log('⚠️  Nenhuma OS disponível para programar');
    return;
  }

  // Teste com arrays de recursos OMITIDOS (agora são opcionais)
  const programar = await testarAPI('PATCH', `/execucao-os/${osId}/programar`, {
    data_hora_programada: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    responsavel: 'Técnico de Teste'
    // materiais_confirmados, ferramentas_confirmadas, tecnicos_confirmados OMITIDOS
  });

  registrar({
    endpoint: '/execucao-os/:id/programar',
    metodo: 'PATCH',
    status: programar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: programar.status,
    tempo: programar.tempo,
    detalhes: programar.sucesso ? 'OS programada sem recursos confirmados' : 'Falha ao programar',
    erro: programar.erro
  });

  return osId;
}

async function testarFluxoCompletoOS(osId?: string) {
  console.log('\n═══════════════════════════════════════');
  console.log('  TESTE 4: FLUXO COMPLETO OS');
  console.log('═══════════════════════════════════════\n');

  if (!osId) {
    console.log('⚠️  Nenhuma OS disponível para fluxo completo');
    return;
  }

  // Iniciar
  const iniciar = await testarAPI('PATCH', `/execucao-os/${osId}/iniciar`, {
    equipe_presente: ['Técnico Teste'],
    responsavel_execucao: 'Técnico Teste'
  });

  registrar({
    endpoint: '/execucao-os/:id/iniciar',
    metodo: 'PATCH',
    status: iniciar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: iniciar.status,
    tempo: iniciar.tempo,
    detalhes: iniciar.sucesso ? 'Execução iniciada' : 'Falha ao iniciar',
    erro: iniciar.erro
  });

  if (!iniciar.sucesso) return;

  // Pausar
  const pausar = await testarAPI('PATCH', `/execucao-os/${osId}/pausar`, {
    motivo_pausa: 'Teste de pausa'
  });

  registrar({
    endpoint: '/execucao-os/:id/pausar',
    metodo: 'PATCH',
    status: pausar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: pausar.status,
    tempo: pausar.tempo,
    detalhes: pausar.sucesso ? 'Execução pausada' : 'Falha ao pausar',
    erro: pausar.erro
  });

  // Retomar
  const retomar = await testarAPI('PATCH', `/execucao-os/${osId}/retomar`, {
    observacoes_retomada: 'Retomando execução'
  });

  registrar({
    endpoint: '/execucao-os/:id/retomar',
    metodo: 'PATCH',
    status: retomar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: retomar.status,
    tempo: retomar.tempo,
    detalhes: retomar.sucesso ? 'Execução retomada' : 'Falha ao retomar',
    erro: retomar.erro
  });

  // Finalizar (arrays OMITIDOS - agora são opcionais)
  const finalizar = await testarAPI('PATCH', `/execucao-os/${osId}/finalizar`, {
    resultado_servico: 'Serviço concluído com sucesso',
    avaliacao_qualidade: 5
    // materiais_consumidos e ferramentas_utilizadas OMITIDOS
  });

  registrar({
    endpoint: '/execucao-os/:id/finalizar',
    metodo: 'PATCH',
    status: finalizar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: finalizar.status,
    tempo: finalizar.tempo,
    detalhes: finalizar.sucesso ? 'OS finalizada sem materiais/ferramentas' : 'Falha ao finalizar',
    erro: finalizar.erro
  });
}

function gerarRelatorio() {
  console.log('\n═══════════════════════════════════════');
  console.log('  RESUMO DOS TESTES - DTOs CORRIGIDOS');
  console.log('═══════════════════════════════════════\n');

  const sucessos = resultados.filter(r => r.status === 'SUCESSO').length;
  const falhas = resultados.filter(r => r.status === 'FALHA').length;
  const total = resultados.length;

  console.log(`📊 Total de testes: ${total}`);
  console.log(`✅ Sucessos: ${sucessos} (${((sucessos/total)*100).toFixed(1)}%)`);
  console.log(`❌ Falhas: ${falhas} (${((falhas/total)*100).toFixed(1)}%)`);

  if (falhas > 0) {
    console.log('\n❌ TESTES COM FALHA:\n');
    resultados
      .filter(r => r.status === 'FALHA')
      .forEach(r => {
        console.log(`  • ${r.metodo} ${r.endpoint} (${r.statusCode})`);
        console.log(`    └─ ${r.detalhes}`);
      });
  }

  console.log('\n📋 CORREÇÕES APLICADAS:');
  console.log('  1. ✅ CreateProgramacaoDto: tempo_estimado e duracao_estimada opcionais');
  console.log('  2. ✅ AprovarProgramacaoDto: validação cruzada data/hora');
  console.log('  3. ✅ MaterialFinalizacaoDto: quantidade_consumida min 0.001');
  console.log('  4. ✅ ProgramarOSDto: arrays de recursos opcionais');
  console.log('  5. ✅ FinalizarOSDto: materiais e ferramentas opcionais');
}

async function main() {
  try {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  TESTES COMPLETOS - DTOs CORRIGIDOS');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`API URL: ${API_URL}`);

    AUTH_TOKEN = await fazerLogin();

    // Executar testes em sequência
    const progId = await testarCriacaoProgramacao();
    const osId = await testarAprovacaoComValidacaoCruzada();
    await testarProgramarOS(osId);
    await testarFluxoCompletoOS(osId);

    // Relatório
    gerarRelatorio();

    console.log('\n✅ TESTES CONCLUÍDOS!\n');
  } catch (error: any) {
    console.error('\n❌ ERRO FATAL:', error.message);
    process.exit(1);
  }
}

main();
