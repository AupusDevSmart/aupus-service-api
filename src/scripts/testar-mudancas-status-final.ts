/**
 * Script FINAL para testar mudanças de status
 * Cria novas programações/OS para poder testar as transições corretamente
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

// Carregar dados reais
const dadosReais = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'scripts-teste', 'dados-extraidos.json'), 'utf-8')
);

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
  const response = await axios.post(`${API_URL}/auth/login`, AUTH_CREDENTIALS, { timeout: 10000 });
  const authData = response.data.data;
  console.log(`\n✅ Login: ${authData.user?.nome} (${authData.user?.roles?.[0]})`);
  return authData.access_token;
}

async function testarAPI(metodo: string, endpoint: string, dados?: any): Promise<any> {
  const inicio = Date.now();
  try {
    const config: any = {
      method: metodo,
      url: `${API_URL}${endpoint}`,
      timeout: 15000,
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` }
    };
    if (dados) config.data = dados;

    const response = await axios(config);
    return {
      sucesso: true,
      data: response.data?.data || response.data,
      status: response.status,
      tempo: Date.now() - inicio
    };
  } catch (error: any) {
    return {
      sucesso: false,
      erro: error.response?.data || error.message,
      status: error.response?.status || 500,
      tempo: Date.now() - inicio
    };
  }
}

function registrar(resultado: TesteResultado) {
  resultados.push(resultado);
  const emoji = resultado.status === 'SUCESSO' ? '✅' : resultado.status === 'FALHA' ? '❌' : '⏭️';
  console.log(`${emoji} ${resultado.metodo} ${resultado.endpoint} - ${resultado.status} (${resultado.tempo}ms)`);
  if (resultado.detalhes) console.log(`   └─ ${resultado.detalhes}`);
  if (resultado.erro && resultado.status === 'FALHA') {
    const erroMsg = typeof resultado.erro === 'object'
      ? JSON.stringify(resultado.erro).substring(0, 200)
      : String(resultado.erro).substring(0, 200);
    console.log(`   └─ Erro: ${erroMsg}`);
  }
}

async function testarFluxoProgramacaoOS() {
  console.log('\n═══════════════════════════════════════');
  console.log('  TESTANDO FLUXO COMPLETO - PROGRAMAÇÃO OS');
  console.log('═══════════════════════════════════════\n');

  // Passo 1: Criar nova programação a partir de anomalia
  const anomaliaId = dadosReais.anomalias[0]?.id;
  if (!anomaliaId) {
    console.log('⚠️  Nenhuma anomalia disponível para criar programação');
    return;
  }

  console.log(`📋 Criando programação a partir da anomalia: ${anomaliaId}\n`);

  const criar = await testarAPI('POST', `/anomalias/${anomaliaId}/criar-programacao`, {});
  if (!criar.sucesso) {
    console.log('❌ Falha ao criar programação. Pulando testes.\n');
    return;
  }

  const progId = criar.data.id;
  console.log(`✅ Programação criada: ${progId} (Status: PENDENTE)\n`);

  // Teste 1: Analisar (PENDENTE -> EM_ANALISE)
  const analisar = await testarAPI('PATCH', `/programacao-os/${progId}/analisar`, {
    observacoes_analise: 'Análise via teste automatizado'
  });
  registrar({
    endpoint: `/programacao-os/:id/analisar`,
    metodo: 'PATCH',
    status: analisar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: analisar.status,
    tempo: analisar.tempo,
    detalhes: analisar.sucesso ? 'PENDENTE → EM_ANALISE' : 'Falha ao analisar',
    erro: analisar.erro
  });

  if (!analisar.sucesso) return;

  // Teste 2: Aprovar (EM_ANALISE -> APROVADA e criar OS)
  const aprovar = await testarAPI('PATCH', `/programacao-os/${progId}/aprovar`, {
    observacoes_aprovacao: 'Aprovado automaticamente'
  });
  registrar({
    endpoint: `/programacao-os/:id/aprovar`,
    metodo: 'PATCH',
    status: aprovar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: aprovar.status,
    tempo: aprovar.tempo,
    detalhes: aprovar.sucesso ? 'EM_ANALISE → APROVADA (OS criada)' : 'Falha ao aprovar',
    erro: aprovar.erro
  });

  // Teste 3: Criar outra programação e REJEITAR
  const criar2 = await testarAPI('POST', `/anomalias/${anomaliaId}/criar-programacao`, {});
  if (criar2.sucesso) {
    const progId2 = criar2.data.id;

    // Analisar primeiro
    await testarAPI('PATCH', `/programacao-os/${progId2}/analisar`, {});

    // Rejeitar
    const rejeitar = await testarAPI('PATCH', `/programacao-os/${progId2}/rejeitar`, {
      motivo_rejeicao: 'Falta de recursos',
      sugestoes_melhoria: 'Aguardar material chegar'
    });
    registrar({
      endpoint: `/programacao-os/:id/rejeitar`,
      metodo: 'PATCH',
      status: rejeitar.sucesso ? 'SUCESSO' : 'FALHA',
      statusCode: rejeitar.status,
      tempo: rejeitar.tempo,
      detalhes: rejeitar.sucesso ? 'EM_ANALISE → REJEITADA' : 'Falha ao rejeitar',
      erro: rejeitar.erro
    });
  }

  // Teste 4: Criar outra programação e CANCELAR
  const criar3 = await testarAPI('POST', `/anomalias/${anomaliaId}/criar-programacao`, {});
  if (criar3.sucesso) {
    const progId3 = criar3.data.id;

    const cancelar = await testarAPI('PATCH', `/programacao-os/${progId3}/cancelar`, {
      motivo_cancelamento: 'Teste de cancelamento'
    });
    registrar({
      endpoint: `/programacao-os/:id/cancelar`,
      metodo: 'PATCH',
      status: cancelar.sucesso ? 'SUCESSO' : 'FALHA',
      statusCode: cancelar.status,
      tempo: cancelar.tempo,
      detalhes: cancelar.sucesso ? 'PENDENTE → CANCELADA' : 'Falha ao cancelar',
      erro: cancelar.erro
    });
  }

  return aprovar.data?.ordem_servico_id;
}

async function testarFluxoExecucaoOS(osId?: string) {
  console.log('\n═══════════════════════════════════════');
  console.log('  TESTANDO FLUXO COMPLETO - EXECUÇÃO OS');
  console.log('═══════════════════════════════════════\n');

  // Buscar OS criada pela aprovação ou criar nova
  if (!osId) {
    // Buscar OS PLANEJADA
    const buscar = await testarAPI('GET', '/execucao-os?status=PLANEJADA&limit=1');
    if (!buscar.sucesso || !buscar.data?.data || buscar.data.data.length === 0) {
      console.log('⚠️  Nenhuma OS PLANEJADA disponível. Pulando testes.\n');
      return;
    }
    osId = buscar.data.data[0].id;
  }

  console.log(`📋 Testando OS: ${osId}\n`);

  // Teste 1: Programar (PLANEJADA -> PROGRAMADA)
  const programar = await testarAPI('PATCH', `/execucao-os/${osId}/programar`, {
    data_hora_programada: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    responsavel: 'Técnico de Teste',
    materiais_confirmados: [],
    ferramentas_confirmadas: [],
    tecnicos_confirmados: [],
    observacoes_programacao: 'Teste automatizado'
  });
  registrar({
    endpoint: `/execucao-os/:id/programar`,
    metodo: 'PATCH',
    status: programar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: programar.status,
    tempo: programar.tempo,
    detalhes: programar.sucesso ? 'PLANEJADA → PROGRAMADA' : 'Falha ao programar',
    erro: programar.erro
  });

  if (!programar.sucesso) return;

  // Teste 2: Iniciar (PROGRAMADA -> EM_EXECUCAO)
  const iniciar = await testarAPI('PATCH', `/execucao-os/${osId}/iniciar`, {
    equipe_presente: ['Técnico 1', 'Técnico 2'],
    responsavel_execucao: 'Técnico de Teste',
    observacoes_inicio: 'Início dos trabalhos'
  });
  registrar({
    endpoint: `/execucao-os/:id/iniciar`,
    metodo: 'PATCH',
    status: iniciar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: iniciar.status,
    tempo: iniciar.tempo,
    detalhes: iniciar.sucesso ? 'PROGRAMADA → EM_EXECUCAO' : 'Falha ao iniciar',
    erro: iniciar.erro
  });

  if (!iniciar.sucesso) return;

  // Teste 3: Pausar (EM_EXECUCAO -> PAUSADA)
  const pausar = await testarAPI('PATCH', `/execucao-os/${osId}/pausar`, {
    motivo_pausa: 'Pausa para almoço',
    observacoes: 'Retorno às 13h'
  });
  registrar({
    endpoint: `/execucao-os/:id/pausar`,
    metodo: 'PATCH',
    status: pausar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: pausar.status,
    tempo: pausar.tempo,
    detalhes: pausar.sucesso ? 'EM_EXECUCAO → PAUSADA' : 'Falha ao pausar',
    erro: pausar.erro
  });

  if (!pausar.sucesso) return;

  // Teste 4: Retomar (PAUSADA -> EM_EXECUCAO)
  const retomar = await testarAPI('PATCH', `/execucao-os/${osId}/retomar`, {
    observacoes_retomada: 'Trabalhos retomados'
  });
  registrar({
    endpoint: `/execucao-os/:id/retomar`,
    metodo: 'PATCH',
    status: retomar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: retomar.status,
    tempo: retomar.tempo,
    detalhes: retomar.sucesso ? 'PAUSADA → EM_EXECUCAO' : 'Falha ao retomar',
    erro: retomar.erro
  });

  if (!retomar.sucesso) return;

  // Teste 5: Finalizar (EM_EXECUCAO -> FINALIZADA)
  const finalizar = await testarAPI('PATCH', `/execucao-os/${osId}/finalizar`, {
    resultado_servico: 'Serviço concluído com êxito',
    problemas_encontrados: 'Nenhum problema',
    recomendacoes: 'Manutenção preventiva em 6 meses',
    materiais_consumidos: [],
    ferramentas_utilizadas: [],
    avaliacao_qualidade: 5,
    observacoes_qualidade: 'Trabalho impecável'
  });
  registrar({
    endpoint: `/execucao-os/:id/finalizar`,
    metodo: 'PATCH',
    status: finalizar.sucesso ? 'SUCESSO' : 'FALHA',
    statusCode: finalizar.status,
    tempo: finalizar.tempo,
    detalhes: finalizar.sucesso ? 'EM_EXECUCAO → FINALIZADA' : 'Falha ao finalizar',
    erro: finalizar.erro
  });

  // Teste 6: Cancelar (testar em nova OS)
  const buscarPlanejada = await testarAPI('GET', '/execucao-os?status=PLANEJADA&limit=1');
  if (buscarPlanejada.sucesso && buscarPlanejada.data?.data?.length > 0) {
    const osId2 = buscarPlanejada.data.data[0].id;

    const cancelar = await testarAPI('PATCH', `/execucao-os/${osId2}/cancelar`, {
      motivo_cancelamento: 'Equipamento fora de operação',
      observacoes: 'Será reagendado'
    });
    registrar({
      endpoint: `/execucao-os/:id/cancelar`,
      metodo: 'PATCH',
      status: cancelar.sucesso ? 'SUCESSO' : 'FALHA',
      statusCode: cancelar.status,
      tempo: cancelar.tempo,
      detalhes: cancelar.sucesso ? 'PLANEJADA → CANCELADA' : 'Falha ao cancelar',
      erro: cancelar.erro
    });
  } else {
    console.log('⏭️  Pulando teste de cancelar (nenhuma OS PLANEJADA disponível)\n');
  }
}

function gerarRelatorio() {
  console.log('\n═══════════════════════════════════════');
  console.log('  RESUMO FINAL DOS TESTES');
  console.log('═══════════════════════════════════════\n');

  const sucessos = resultados.filter(r => r.status === 'SUCESSO').length;
  const falhas = resultados.filter(r => r.status === 'FALHA').length;
  const total = resultados.length;

  console.log(`📊 Total de testes: ${total}`);
  console.log(`✅ Sucessos: ${sucessos} (${((sucessos/total)*100).toFixed(1)}%)`);
  console.log(`❌ Falhas: ${falhas} (${((falhas/total)*100).toFixed(1)}%)`);

  if (falhas > 0) {
    console.log('\n❌ TESTES COM FALHA:\n');
    resultados.filter(r => r.status === 'FALHA').forEach(r => {
      console.log(`  • ${r.metodo} ${r.endpoint} (${r.statusCode})`);
      console.log(`    └─ ${r.detalhes}`);
    });
  }

  if (sucessos === total) {
    console.log('\n🎉 TODOS OS TESTES PASSARAM COM SUCESSO!');
  }
}

async function main() {
  try {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  TESTES FINAIS - FLUXO COMPLETO DE MUDANÇAS DE STATUS');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`API URL: ${API_URL}`);

    AUTH_TOKEN = await fazerLogin();

    const osId = await testarFluxoProgramacaoOS();
    await testarFluxoExecucaoOS(osId);

    gerarRelatorio();

    console.log('\n✅ TESTES CONCLUÍDOS!\n');
  } catch (error: any) {
    console.error('\n❌ ERRO FATAL:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
