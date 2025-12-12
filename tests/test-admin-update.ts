// Script para testar atualização do admin@email.com especificamente
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api/v1';

async function testAdminUpdate() {
  console.log('🧪 TESTE: Atualizar admin@email.com para super_admin\n');
  console.log('='.repeat(80));

  try {
    // 1. Login como admin
    console.log('\n1️⃣ Fazendo login...');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: 'admin@email.com',
      senha: 'Aupus123!'
    });
    const token = loginResponse.data.data.access_token;
    const decoded: any = require('jsonwebtoken').decode(token);
    const userId = decoded.sub;
    console.log('✅ Token obtido');
    console.log('📝 User ID:', userId);

    const api = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // 2. Ver estado atual
    console.log('\n2️⃣ Estado atual do usuário...');
    let getResponse = await api.get(`/usuarios/${userId}`);
    let usuario = getResponse.data.data || getResponse.data;
    console.log('📝 Role atual (legacy):', usuario.role || 'N/A');
    console.log('📝 Roles (Spatie):', usuario.roles);

    // 3. Simular o que o FRONT-END envia
    console.log('\n3️⃣ Simulando UPDATE como o front-end faz...');

    // O front envia roleNames como string única (valor do select)
    const updateDataFront = {
      roleNames: ['super_admin']  // Array com um elemento (como o backend espera)
    };

    console.log('📤 Dados enviados (como front):', JSON.stringify(updateDataFront, null, 2));

    try {
      const updateResponse = await api.patch(`/usuarios/${userId}`, updateDataFront);
      console.log('✅ UPDATE aceito! Status:', updateResponse.status);

      // Verificar resultado
      getResponse = await api.get(`/usuarios/${userId}`);
      usuario = getResponse.data.data || getResponse.data;
      console.log('\n📝 RESULTADO APÓS UPDATE:');
      console.log('   Role (legacy):', usuario.role || 'N/A');
      console.log('   Roles (Spatie):', usuario.roles);

      if (usuario.roles && usuario.roles.includes('super_admin')) {
        console.log('\n✅ SUCESSO! Role super_admin foi atribuída!');
      } else {
        console.log('\n❌ PROBLEMA! Role NÃO foi atribuída corretamente');
        console.log('   Esperado: [\'super_admin\']');
        console.log('   Obtido:', usuario.roles);
      }

      // Verificar permissões
      console.log('\n4️⃣ Verificando permissões...');
      const permsResponse = await api.get(`/usuarios/${userId}/permissions`);
      const permsData = permsResponse.data.data || permsResponse.data;
      console.log('📝 Role final:', permsData.role?.name);
      console.log('📝 Total permissions:', permsData.permissions?.length || 0);

      if (permsData.permissions && permsData.permissions.length > 0) {
        console.log('📝 Primeiras 5 permissions:');
        permsData.permissions.slice(0, 5).forEach((p: any) => {
          console.log(`   - ${p.name || p}`);
        });
      }

    } catch (error: any) {
      console.log('❌ ERRO no UPDATE:', error.response?.status);
      console.log('📝 Response:', JSON.stringify(error.response?.data, null, 2));
    }

    // 5. Teste adicional: enviar como string (caso o front envie errado)
    console.log('\n5️⃣ Teste: Enviar roleNames como string única...');
    const updateDataString = {
      roleNames: 'super_admin'  // String ao invés de array
    };

    console.log('📤 Dados:', JSON.stringify(updateDataString, null, 2));

    try {
      const updateResponse2 = await api.patch(`/usuarios/${userId}`, updateDataString);
      console.log('✅ Também aceita string! Status:', updateResponse2.status);
    } catch (error: any) {
      console.log('❌ Não aceita string:', error.response?.status);
      console.log('📝 Error:', error.response?.data?.message);
    }

    console.log('\n' + '='.repeat(80));

  } catch (error: any) {
    console.error('\n❌ Erro:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testAdminUpdate().catch(console.error);
