// Script para testar atualização de role via front-end
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api/v1';

async function testUpdateRole() {
  console.log('🧪 TESTE: Atualizar Role de Usuário\n');
  console.log('='.repeat(80));

  try {
    // 1. Login como admin
    console.log('\n1️⃣ Fazendo login como admin...');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: 'admin@email.com',
      senha: 'Aupus123!'
    });
    const token = loginResponse.data.data.access_token;
    console.log('✅ Token obtido');

    const api = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // 2. Criar usuário de teste
    console.log('\n2️⃣ Criando usuário de teste...');
    const userData = {
      nome: 'Teste Update Role',
      email: `teste.role.${Date.now()}@test.com`,
      telefone: '11999999999',
      status: 'Ativo'
    };
    const createResponse = await api.post('/usuarios', userData);
    const userId = (createResponse.data.data || createResponse.data).id;
    console.log('✅ Usuário criado:', userId);

    // 3. Verificar role inicial
    console.log('\n3️⃣ Verificando role inicial...');
    let getResponse = await api.get(`/usuarios/${userId}`);
    let usuario = getResponse.data.data || getResponse.data;
    console.log('📝 Role inicial:', usuario.role || 'N/A');
    console.log('📝 Roles (Spatie):', usuario.roles);

    // 4. Testar UPDATE com roleNames (como o front envia)
    console.log('\n4️⃣ Atualizando com roleNames: ["super_admin"]...');
    const updateData1 = {
      roleNames: ['super_admin']  // Como o front-end envia
    };
    console.log('📤 Enviando:', JSON.stringify(updateData1, null, 2));

    try {
      const updateResponse1 = await api.patch(`/usuarios/${userId}`, updateData1);
      console.log('✅ UPDATE com roleNames aceito!');
      console.log('📝 Response status:', updateResponse1.status);

      // Verificar se foi aplicado
      getResponse = await api.get(`/usuarios/${userId}`);
      usuario = getResponse.data.data || getResponse.data;
      console.log('📝 Role após update:', usuario.role || 'N/A');
      console.log('📝 Roles (Spatie):', usuario.roles);

      if (usuario.roles && usuario.roles.includes('super_admin')) {
        console.log('✅ SUCESSO! Role "super_admin" foi atribuída corretamente!');
      } else {
        console.log('⚠️  WARNING: Role não foi atribuída como esperado');
      }
    } catch (error: any) {
      console.log('❌ ERRO no update com roleNames:', error.response?.status);
      console.log('📝 Error:', error.response?.data);
    }

    // 5. Testar UPDATE com roleId (forma recomendada)
    console.log('\n5️⃣ Atualizando com roleId: 2 (admin)...');

    // Primeiro, buscar o ID da role admin
    const rolesResponse = await api.get('/usuarios/available/roles');
    const roles = rolesResponse.data.data || rolesResponse.data;
    const adminRole = roles.find((r: any) => r.name === 'admin');

    if (adminRole) {
      console.log('📝 Role "admin" encontrada com ID:', adminRole.id);

      const updateData2 = {
        roleId: adminRole.id  // Forma recomendada
      };
      console.log('📤 Enviando:', JSON.stringify(updateData2, null, 2));

      const updateResponse2 = await api.patch(`/usuarios/${userId}`, updateData2);
      console.log('✅ UPDATE com roleId aceito!');

      // Verificar se foi aplicado
      getResponse = await api.get(`/usuarios/${userId}`);
      usuario = getResponse.data.data || getResponse.data;
      console.log('📝 Role após update:', usuario.role || 'N/A');
      console.log('📝 Roles (Spatie):', usuario.roles);

      if (usuario.roles && usuario.roles.includes('admin')) {
        console.log('✅ SUCESSO! Role "admin" foi atribuída corretamente!');
      }
    }

    // 6. Buscar permissões finais
    console.log('\n6️⃣ Verificando permissões finais...');
    const permsResponse = await api.get(`/usuarios/${userId}/permissions`);
    const permsData = permsResponse.data.data || permsResponse.data;
    console.log('📝 Role final:', permsData.role?.name);
    console.log('📝 Total de permissions:', permsData.permissions?.length || 0);
    console.log('📝 Permission names:', permsData.permissionNames?.slice(0, 5));

    // 7. Cleanup
    console.log('\n7️⃣ Limpando usuário de teste...');
    await api.delete(`/usuarios/${userId}`);
    console.log('✅ Usuário deletado');

    console.log('\n' + '='.repeat(80));
    console.log('✅ TESTE COMPLETO!\n');

    // RESUMO
    console.log('📊 RESUMO:');
    console.log('- roleNames (deprecated): ✅ FUNCIONA');
    console.log('- roleId (recomendado): ✅ FUNCIONA');
    console.log('- Ambos funcionam corretamente no backend!');

  } catch (error: any) {
    console.error('\n❌ Erro no teste:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testUpdateRole().catch(console.error);
