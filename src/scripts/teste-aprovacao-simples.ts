import axios from 'axios';

const API_URL = 'http://localhost:3000/api/v1';

async function main() {
  try {
    // Login
    const login = await axios.post(`${API_URL}/auth/login`, {
      email: 'pjlunardelli@hotmail.com',
      senha: 'Aupus123!'
    });

    const token = login.data.data.access_token;
    const config = { headers: { Authorization: `Bearer ${token}` } };

    console.log('✅ Login OK\n');

    // Criar programação
    console.log('Criando programação...');
    const prog = await axios.post(`${API_URL}/programacao-os`, {
      descricao: 'Teste aprovação',
      local: 'Local Teste',
      ativo: 'Ativo Teste',
      condicoes: 'FUNCIONANDO',
      tipo: 'PREVENTIVA',
      prioridade: 'MEDIA',
      origem: 'MANUAL',
      responsavel: 'Responsável Teste' // IMPORTANTE: Garantir que tem responsável
    }, config);

    const progId = prog.data.data.id;
    console.log(`✅ Programação criada: ${progId}\n`);

    // Analisar
    console.log('Analisando...');
    await axios.patch(`${API_URL}/programacao-os/${progId}/analisar`, {}, config);
    console.log('✅ Analisada\n');

    // Aprovar
    console.log('Aprovando...');
    try {
      const aprovar = await axios.patch(`${API_URL}/programacao-os/${progId}/aprovar`, {
        data_programada_sugerida: '2025-12-15',
        hora_programada_sugerida: '08:00'
      }, config);
      console.log('✅ APROVADA COM SUCESSO!');
      console.log(`OS criada: ${aprovar.data.data?.os_id || 'N/A'}`);
    } catch (err: any) {
      console.log('❌ ERRO NA APROVAÇÃO:');
      console.log(JSON.stringify(err.response?.data || err.message, null, 2));
    }

  } catch (error: any) {
    console.error('❌ ERRO:', error.response?.data || error.message);
  }
}

main();
