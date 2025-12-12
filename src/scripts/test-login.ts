/**
 * Script simples para testar login e ver resposta completa
 */

import axios from 'axios';

const API_URL = 'http://localhost:3000/api/v1';

async function testarLogin() {
  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: 'pjlunardelli@hotmail.com',
      senha: 'Aupus123!'
    });

    console.log('\n✅ Login bem-sucedido!');
    console.log('\n📋 Resposta completa:');
    console.log(JSON.stringify(response.data, null, 2));

    console.log('\n🔑 Token extraído:');
    console.log(response.data.access_token);

    console.log('\n👤 Usuário:');
    console.log(response.data.user);

  } catch (error: any) {
    console.log('\n❌ Erro no login:');
    console.log('Status:', error.response?.status);
    console.log('Dados:', JSON.stringify(error.response?.data, null, 2));
  }
}

testarLogin();
