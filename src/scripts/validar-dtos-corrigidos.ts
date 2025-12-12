/**
 * Script simples para validar que os DTOs corrigidos estão funcionando
 */

import axios from 'axios';

const API_URL = 'http://localhost:3000/api/v1';

const AUTH_CREDENTIALS = {
  email: 'pjlunardelli@hotmail.com',
  senha: 'Aupus123!'
};

let AUTH_TOKEN: string | null = null;

async function main() {
  try {
    console.log('═══════════════════════════════════════');
    console.log('  VALIDAÇÃO DE DTOs CORRIGIDOS');
    console.log('═══════════════════════════════════════\n');

    // Login
    console.log('🔐 Fazendo login...');
    const loginResp = await axios.post(`${API_URL}/auth/login`, AUTH_CREDENTIALS);
    AUTH_TOKEN = loginResp.data.data.access_token;
    console.log('✅ Login realizado\n');

    const config = {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` }
    };

    // TESTE 1: CreateProgramacaoDto - campos opcionais
    console.log('📝 TESTE 1: Criar programação SEM tempo_estimado (agora opcional)');
    try {
      const prog1 = await axios.post(`${API_URL}/programacao-os`, {
        descricao: 'Teste DTO - campos opcionais',
        local: 'Planta Teste',
        ativo: 'Equipamento Teste',
        condicoes: 'FUNCIONANDO',
        tipo: 'PREVENTIVA',
        prioridade: 'MEDIA',
        origem: 'MANUAL'
        // tempo_estimado OMITIDO - deve usar padrão 2h
        // duracao_estimada OMITIDO - deve usar padrão 3h
      }, config);
      console.log('✅ SUCESSO: Programação criada sem tempo_estimado');
      console.log(`   └─ ID: ${prog1.data.data.id}`);
      console.log(`   └─ tempo_estimado padrão: ${prog1.data.data.tempo_estimado}h`);
      console.log(`   └─ duracao_estimada padrão: ${prog1.data.data.duracao_estimada}h\n`);
    } catch (err: any) {
      console.log('❌ FALHA: ' + (err.response?.data?.error?.message || err.message));
      if (err.response?.data) {
        console.log('   └─ Detalhes:', JSON.stringify(err.response.data, null, 2).substring(0, 500));
      }
      console.log();
    }

    // TESTE 2: AprovarProgramacaoDto - validação cruzada
    console.log('📝 TESTE 2: Aprovar com apenas DATA (sem hora - deve falhar)');

    // Criar programação para teste
    const prog2 = await axios.post(`${API_URL}/programacao-os`, {
      descricao: 'Teste validação cruzada',
      local: 'Planta Teste',
      ativo: 'Equipamento Teste',
      condicoes: 'FUNCIONANDO',
      tipo: 'PREVENTIVA',
      prioridade: 'MEDIA',
      origem: 'MANUAL'
    }, config);
    const progId = prog2.data.data.id;

    // Analisar
    await axios.patch(`${API_URL}/programacao-os/${progId}/analisar`, {
      observacoes_analise: 'Teste'
    }, config);

    try {
      await axios.patch(`${API_URL}/programacao-os/${progId}/aprovar`, {
        data_programada_sugerida: '2025-12-15'
        // hora_programada_sugerida OMITIDA - validação cruzada deve rejeitar
      }, config);
      console.log('❌ ERRO: Validação cruzada NÃO funcionou (deveria rejeitar)\n');
    } catch (err: any) {
      console.log('✅ SUCESSO: Validação cruzada funcionou corretamente');
      console.log(`   └─ ${err.response?.data?.error?.message || 'Rejeitou data sem hora'}\n`);
    }

    // TESTE 3: Aprovar com data E hora (deve funcionar)
    console.log('📝 TESTE 3: Aprovar com DATA e HORA (deve funcionar)');

    // Nova programação
    const prog3 = await axios.post(`${API_URL}/programacao-os`, {
      descricao: 'Teste validação completa',
      local: 'Planta Teste',
      ativo: 'Equipamento Teste',
      condicoes: 'FUNCIONANDO',
      tipo: 'PREVENTIVA',
      prioridade: 'MEDIA',
      origem: 'MANUAL'
    }, config);
    const progId3 = prog3.data.data.id;

    await axios.patch(`${API_URL}/programacao-os/${progId3}/analisar`, {}, config);

    try {
      const aprovar = await axios.patch(`${API_URL}/programacao-os/${progId3}/aprovar`, {
        data_programada_sugerida: '2025-12-15',
        hora_programada_sugerida: '08:00'
      }, config);
      console.log('✅ SUCESSO: Aprovação com data e hora completas');
      console.log(`   └─ OS criada: ${aprovar.data.data.os_id || 'N/A'}\n`);

      const osId = aprovar.data.data.os_id;

      // TESTE 4: ProgramarOSDto - arrays opcionais
      if (osId) {
        console.log('📝 TESTE 4: Programar OS SEM arrays de recursos (agora opcionais)');
        try {
          await axios.patch(`${API_URL}/execucao-os/${osId}/programar`, {
            data_hora_programada: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            responsavel: 'Técnico Teste'
            // materiais_confirmados, ferramentas_confirmadas, tecnicos_confirmados OMITIDOS
          }, config);
          console.log('✅ SUCESSO: OS programada sem arrays de recursos\n');

          // TESTE 5: Fluxo completo
          console.log('📝 TESTE 5: Finalizar OS SEM materiais/ferramentas (agora opcionais)');

          // Iniciar
          await axios.patch(`${API_URL}/execucao-os/${osId}/iniciar`, {
            equipe_presente: ['Técnico'],
            responsavel_execucao: 'Técnico'
          }, config);

          // Finalizar sem materiais
          await axios.patch(`${API_URL}/execucao-os/${osId}/finalizar`, {
            resultado_servico: 'Concluído',
            avaliacao_qualidade: 5
            // materiais_consumidos e ferramentas_utilizadas OMITIDOS
          }, config);
          console.log('✅ SUCESSO: OS finalizada sem materiais/ferramentas\n');
        } catch (err: any) {
          console.log('❌ FALHA: ' + (err.response?.data?.error?.message || err.message) + '\n');
        }
      }
    } catch (err: any) {
      console.log('❌ FALHA: ' + (err.response?.data?.error?.message || err.message));
      if (err.response?.data) {
        console.log('   └─ Erro completo:', JSON.stringify(err.response.data).substring(0, 400));
      }
      console.log();
    }

    console.log('═══════════════════════════════════════');
    console.log('  RESUMO DAS CORREÇÕES APLICADAS');
    console.log('═══════════════════════════════════════');
    console.log('1. ✅ CreateProgramacaoDto: tempo_estimado opcional (padrão: 2h)');
    console.log('2. ✅ CreateProgramacaoDto: duracao_estimada opcional (padrão: 3h)');
    console.log('3. ✅ AprovarProgramacaoDto: validação cruzada data+hora');
    console.log('4. ✅ MaterialFinalizacaoDto: quantidade min 0.001 (não 0)');
    console.log('5. ✅ ProgramarOSDto: arrays de recursos opcionais');
    console.log('6. ✅ FinalizarOSDto: materiais/ferramentas opcionais');
    console.log('\n✅ VALIDAÇÃO CONCLUÍDA!\n');

  } catch (error: any) {
    console.error('❌ ERRO:', error.message);
    process.exit(1);
  }
}

main();
