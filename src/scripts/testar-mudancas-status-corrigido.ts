/**
 * Script para testar mudanças de status de Programação OS e Execução OS
 * VERSÃO CORRIGIDA com campos corretos dos DTOs
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
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
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

async function testarProgramacaoOS() {
  console.log('\n═══════════════════════════════════════');
  console.log('  TESTANDO MUDANÇAS DE STATUS - PROGRAMAÇÃO OS');
  console.log('═══════════════════════════════════════\n');

  // Buscar uma programação existente
  const listar = await testarAPI('GET', '/programacao-os?limit=1');

  if (!listar.sucesso || !listar.data?.data || listar.data.data.length === 0) {
    console.log('⚠️  Nenhuma programação encontrada. Pulando testes de mudança de status.');
    return;
  }

  const progId = listar.data.data[0].id;
  const progStatus = listar.data.data[0].status;
  console.log(`📋 Programação encontrada: ${progId} (Status: ${progStatus})\n`);

  // Teste 1: Analisar (PENDENTE -> EM_ANALISE)
  // DTO: AnalisarProgramacaoDto { observacoes_analise?: string }
  const analisar = await testarAPI('PATCH', `/programacao-os/${progId}/analisar`, {
    observacoes_analise: 'Iniciando análise via teste automatizado'
  });
  registrar({
    endpoint: `/programacao-os/:id/analisar`,
    metodo: 'PATCH',
    status: analisar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: analisar.status,
    tempo: analisar.tempo,
    detalhes: analisar.sucesso ? 'Análise iniciada' : 'Falha ao analisar',
    erro: analisar.erro
  });

  // Teste 2: Aprovar (EM_ANALISE -> APROVADA)
  // DTO: AprovarProgramacaoDto { observacoes_aprovacao?, ajustes_orcamento?, data_programada_sugerida?, hora_programada_sugerida? }
  const aprovar = await testarAPI('PATCH', `/programacao-os/${progId}/aprovar`, {
    observacoes_aprovacao: 'Aprovado via teste automatizado'
  });
  registrar({
    endpoint: `/programacao-os/:id/aprovar`,
    metodo: 'PATCH',
    status: aprovar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: aprovar.status,
    tempo: aprovar.tempo,
    detalhes: aprovar.sucesso ? 'Programação aprovada (OS criada)' : 'Falha ao aprovar',
    erro: aprovar.erro
  });

  // Teste 3: Rejeitar (testar em outra programação se existir)
  // DTO: RejeitarProgramacaoDto { motivo_rejeicao: string, sugestoes_melhoria?: string }
  const listar2 = await testarAPI('GET', '/programacao-os?status=EM_ANALISE&limit=1');
  if (listar2.sucesso && listar2.data?.data?.length > 0) {
    const progId2 = listar2.data.data[0].id;
    const rejeitar = await testarAPI('PATCH', `/programacao-os/${progId2}/rejeitar`, {
      motivo_rejeicao: 'Rejeitado para teste automatizado',
      sugestoes_melhoria: 'Revisar documentação'
    });
    registrar({
      endpoint: `/programacao-os/:id/rejeitar`,
      metodo: 'PATCH',
      status: rejeitar.sucesso ? 'SUCESSO' : 'FALHA',
      statusCode: rejeitar.status,
      tempo: rejeitar.tempo,
      detalhes: rejeitar.sucesso ? 'Programação rejeitada' : 'Falha ao rejeitar',
      erro: rejeitar.erro
    });
  } else {
    console.log('⏭️  Pulando teste de rejeitar (nenhuma prog. EM_ANALISE disponível)\n');
  }

  // Teste 4: Cancelar
  // DTO: CancelarProgramacaoDto { motivo_cancelamento: string }
  const listar3 = await testarAPI('GET', '/programacao-os?status=PENDENTE&limit=1');
  if (listar3.sucesso && listar3.data?.data?.length > 0) {
    const progId3 = listar3.data.data[0].id;
    const cancelar = await testarAPI('PATCH', `/programacao-os/${progId3}/cancelar`, {
      motivo_cancelamento: 'Cancelado para teste automatizado'
    });
    registrar({
      endpoint: `/programacao-os/:id/cancelar`,
      metodo: 'PATCH',
      status: cancelar.sucesso ? 'SUCESSO' : 'FALHA',
      statusCode: cancelar.status,
      tempo: cancelar.tempo,
      detalhes: cancelar.sucesso ? 'Programação cancelada' : 'Falha ao cancelar',
      erro: cancelar.erro
    });
  } else {
    console.log('⏭️  Pulando teste de cancelar (nenhuma prog. PENDENTE disponível)\n');
  }
}

async function testarExecucaoOS() {
  console.log('\n═══════════════════════════════════════');
  console.log('  TESTANDO MUDANÇAS DE STATUS - EXECUÇÃO OS');
  console.log('═══════════════════════════════════════\n');

  // Buscar uma OS existente
  const listar = await testarAPI('GET', '/execucao-os?limit=1');

  if (!listar.sucesso || !listar.data?.data || listar.data.data.length === 0) {
    console.log('⚠️  Nenhuma OS encontrada. Pulando testes de mudança de status.');
    return;
  }

  const osId = listar.data.data[0].id;
  const osStatus = listar.data.data[0].status;
  console.log(`📋 OS encontrada: ${osId} (Status: ${osStatus})\n`);

  // Teste 1: Programar (PLANEJADA -> PROGRAMADA)
  // DTO: ProgramarOSDto { data_hora_programada, responsavel, responsavel_id?, time_equipe?, materiais_confirmados?, ferramentas_confirmadas?, tecnicos_confirmados?, reserva_veiculo?, observacoes_programacao? }
  const programar = await testarAPI('PATCH', `/execucao-os/${osId}/programar`, {
    data_hora_programada: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    responsavel: 'Técnico de Teste',
    observacoes_programacao: 'Programado via teste automatizado'
  });
  registrar({
    endpoint: `/execucao-os/:id/programar`,
    metodo: 'PATCH',
    status: programar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: programar.status,
    tempo: programar.tempo,
    detalhes: programar.sucesso ? 'OS programada' : 'Falha ao programar',
    erro: programar.erro
  });

  // Teste 2: Iniciar (PROGRAMADA -> EM_EXECUCAO)
  // DTO: IniciarExecucaoDto { equipe_presente, responsavel_execucao, observacoes_inicio?, data_hora_inicio_real? }
  const iniciar = await testarAPI('PATCH', `/execucao-os/${osId}/iniciar`, {
    equipe_presente: ['Técnico 1'],
    responsavel_execucao: 'Técnico de Teste',
    observacoes_inicio: 'Iniciado via teste automatizado'
  });
  registrar({
    endpoint: `/execucao-os/:id/iniciar`,
    metodo: 'PATCH',
    status: iniciar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: iniciar.status,
    tempo: iniciar.tempo,
    detalhes: iniciar.sucesso ? 'Execução iniciada' : 'Falha ao iniciar',
    erro: iniciar.erro
  });

  // Teste 3: Pausar (EM_EXECUCAO -> PAUSADA)
  // DTO: PausarExecucaoDto { motivo_pausa: string, observacoes?: string }
  const pausar = await testarAPI('PATCH', `/execucao-os/${osId}/pausar`, {
    motivo_pausa: 'Pausa para teste automatizado',
    observacoes: 'Apenas teste'
  });
  registrar({
    endpoint: `/execucao-os/:id/pausar`,
    metodo: 'PATCH',
    status: pausar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: pausar.status,
    tempo: pausar.tempo,
    detalhes: pausar.sucesso ? 'Execução pausada' : 'Falha ao pausar',
    erro: pausar.erro
  });

  // Teste 4: Retomar (PAUSADA -> EM_EXECUCAO)
  // DTO: RetomarExecucaoDto { observacoes_retomada?: string }
  const retomar = await testarAPI('PATCH', `/execucao-os/${osId}/retomar`, {
    observacoes_retomada: 'Retomado via teste automatizado'
  });
  registrar({
    endpoint: `/execucao-os/:id/retomar`,
    metodo: 'PATCH',
    status: retomar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: retomar.status,
    tempo: retomar.tempo,
    detalhes: retomar.sucesso ? 'Execução retomada' : 'Falha ao retomar',
    erro: retomar.erro
  });

  // Teste 5: Finalizar (EM_EXECUCAO -> FINALIZADA)
  // DTO: FinalizarOSDto { data_hora_fim_real?, resultado_servico, problemas_encontrados?, recomendacoes?, proxima_manutencao?, materiais_consumidos?, ferramentas_utilizadas?, avaliacao_qualidade, observacoes_qualidade?, km_final?, observacoes_veiculo? }
  const finalizar = await testarAPI('PATCH', `/execucao-os/${osId}/finalizar`, {
    resultado_servico: 'Serviço executado com sucesso',
    avaliacao_qualidade: 5,
    observacoes_qualidade: 'Excelente trabalho realizado'
  });
  registrar({
    endpoint: `/execucao-os/:id/finalizar`,
    metodo: 'PATCH',
    status: finalizar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: finalizar.status,
    tempo: finalizar.tempo,
    detalhes: finalizar.sucesso ? 'OS finalizada' : 'Falha ao finalizar',
    erro: finalizar.erro
  });

  // Teste 6: Cancelar (testar em outra OS se existir)
  // DTO: CancelarOSDto { motivo_cancelamento: string, observacoes?: string }
  const listar2 = await testarAPI('GET', '/execucao-os?status=PLANEJADA&limit=1');
  if (listar2.sucesso && listar2.data?.data?.length > 0) {
    const osId2 = listar2.data.data[0].id;
    const cancelar = await testarAPI('PATCH', `/execucao-os/${osId2}/cancelar`, {
      motivo_cancelamento: 'Cancelado para teste automatizado',
      observacoes: 'Apenas teste'
    });
    registrar({
      endpoint: `/execucao-os/:id/cancelar`,
      metodo: 'PATCH',
      status: cancelar.sucesso ? 'SUCESSO' : 'FALHA',
      statusCode: cancelar.status,
      tempo: cancelar.tempo,
      detalhes: cancelar.sucesso ? 'OS cancelada' : 'Falha ao cancelar',
      erro: cancelar.erro
    });
  } else {
    console.log('⏭️  Pulando teste de cancelar (nenhuma OS PLANEJADA disponível)\n');
  }
}

function gerarRelatorio() {
  console.log('\n═══════════════════════════════════════');
  console.log('  RESUMO DOS TESTES');
  console.log('═══════════════════════════════════════\n');

  const sucessos = resultados.filter(r => r.status === 'SUCESSO').length;
  const falhas = resultados.filter(r => r.status === 'FALHA').length;
  const skips = resultados.filter(r => r.status === 'SKIP').length;
  const total = resultados.length;

  console.log(`📊 Total de testes: ${total}`);
  console.log(`✅ Sucessos: ${sucessos} (${((sucessos/total)*100).toFixed(1)}%)`);
  console.log(`❌ Falhas: ${falhas} (${((falhas/total)*100).toFixed(1)}%)`);
  console.log(`⏭️  Pulados: ${skips}`);

  if (falhas > 0) {
    console.log('\n❌ TESTES COM FALHA:\n');
    resultados
      .filter(r => r.status === 'FALHA')
      .forEach(r => {
        console.log(`  • ${r.metodo} ${r.endpoint} (${r.statusCode})`);
        console.log(`    └─ ${r.detalhes}`);
      });
  }
}

async function main() {
  try {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  TESTES DE MUDANÇAS DE STATUS - FLUXO OS (CORRIGIDO)');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`API URL: ${API_URL}`);

    // Login
    AUTH_TOKEN = await fazerLogin();

    // Executar testes
    await testarProgramacaoOS();
    await testarExecucaoOS();

    // Relatório
    gerarRelatorio();

    console.log('\n✅ TESTES CONCLUÍDOS!\n');
  } catch (error: any) {
    console.error('\n❌ ERRO FATAL:', error.message);
    process.exit(1);
  }
}

main();
