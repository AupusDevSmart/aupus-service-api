// Script para debugar os endpoints que estão retornando 404
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api/v1';

async function debugEndpoints() {
  console.log('🔍 DEBUG - Testando endpoints problemáticos\n');
  console.log('='.repeat(80));

  try {
    // 1. Login
    console.log('\n1️⃣ Fazendo login...');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: 'admin@email.com',
      senha: 'Aupus123!'
    });
    const token = loginResponse.data.data.access_token;
    console.log('✅ Token obtido:', token.substring(0, 20) + '...');

    const api = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // 2. Testar GET /usuarios/available/permissions
    console.log('\n2️⃣ Testando GET /usuarios/available/permissions...');
    try {
      const response = await api.get('/usuarios/available/permissions');
      console.log('✅ Status:', response.status);
      console.log('📝 Response structure:', Object.keys(response.data));
      const permissions = response.data.data || response.data;
      console.log('📝 Permissions count:', Array.isArray(permissions) ? permissions.length : 'não é array');
      if (Array.isArray(permissions) && permissions.length > 0) {
        console.log('📝 Primeira permission:', JSON.stringify(permissions[0], null, 2));
      }
    } catch (error: any) {
      console.log('❌ ERROR:', error.response?.status, error.response?.statusText);
      console.log('📝 URL tentada:', error.config?.url);
      console.log('📝 Response data:', JSON.stringify(error.response?.data, null, 2));
    }

    // 3. Criar usuário de teste
    console.log('\n3️⃣ Criando usuário de teste...');
    const testUserData = {
      nome: 'Debug Test User',
      email: `debug.${Date.now()}@test.com`,
      telefone: '11999999999',
      status: 'Ativo'
    };
    const userResponse = await api.post('/usuarios', testUserData);
    const userId = (userResponse.data.data || userResponse.data).id;
    console.log('✅ Usuário criado:', userId);

    // 4. Testar POST /usuarios/:id/assign-permission
    console.log('\n4️⃣ Testando POST /usuarios/:id/assign-permission...');
    try {
      const response = await api.post(`/usuarios/${userId}/assign-permission`, {
        permissionId: 1
      });
      console.log('✅ Status:', response.status);
      console.log('📝 Response:', JSON.stringify(response.data, null, 2));
    } catch (error: any) {
      console.log('❌ ERROR:', error.response?.status, error.response?.statusText);
      console.log('📝 URL tentada:', error.config?.url);
      console.log('📝 Response data:', JSON.stringify(error.response?.data, null, 2));
    }

    // 5. Testar POST /usuarios/:id/sync-permissions
    console.log('\n5️⃣ Testando POST /usuarios/:id/sync-permissions...');
    try {
      const response = await api.post(`/usuarios/${userId}/sync-permissions`, {
        permissionIds: [1, 2, 3]
      });
      console.log('✅ Status:', response.status);
      console.log('📝 Response:', JSON.stringify(response.data, null, 2));
    } catch (error: any) {
      console.log('❌ ERROR:', error.response?.status, error.response?.statusText);
      console.log('📝 URL tentada:', error.config?.url);
      console.log('📝 Response data:', JSON.stringify(error.response?.data, null, 2));
    }

    // 6. Cleanup - deletar usuário de teste
    console.log('\n6️⃣ Limpando usuário de teste...');
    await api.delete(`/usuarios/${userId}`);
    console.log('✅ Usuário deletado');

  } catch (error: any) {
    console.error('\n❌ Erro fatal:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Debug completo\n');
}

debugEndpoints().catch(console.error);
