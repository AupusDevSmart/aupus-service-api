/**
 * Script para capturar erro detalhado de um endpoint
 */

import axios from 'axios';

const API_URL = 'http://localhost:3000/api/v1';

async function testarEndpoint() {
  console.log('Testando endpoint: GET /api/v1/planos-manutencao\n');

  try {
    const response = await axios.get(`${API_URL}/planos-manutencao`, {
      timeout: 10000
    });

    console.log('✅ SUCESSO!');
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(response.data, null, 2));

  } catch (error: any) {
    console.log('❌ ERRO!');
    console.log('Status HTTP:', error.response?.status);
    console.log('\n📋 Resposta completa:');
    console.log(JSON.stringify(error.response?.data, null, 2));
    console.log('\n📋 Mensagem de erro:');
    console.log(error.message);
    console.log('\n📋 Stack trace:');
    console.log(error.stack);
  }
}

testarEndpoint();
