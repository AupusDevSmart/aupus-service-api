// Script para CORRIGIR a role do admin@email.com
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const API_BASE_URL = 'http://localhost:3000/api/v1';
const prisma = new PrismaClient();

async function fixAdminRole() {
  console.log('🔧 CORRIGINDO role do admin@email.com\n');
  console.log('='.repeat(80));

  try {
    const userId = 'k6g72ojagrl415bsak6y68qi96';

    // 1. Login
    console.log('\n1️⃣ Fazendo login...');
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

    // 2. Buscar ID da role super_admin
    console.log('\n2️⃣ Buscando role super_admin...');
    const rolesResponse = await api.get('/usuarios/available/roles');
    const roles = rolesResponse.data.data || rolesResponse.data;
    const superAdminRole = roles.find((r: any) => r.name === 'super_admin');

    if (!superAdminRole) {
      console.log('❌ Role super_admin não encontrada!');
      return;
    }

    console.log('✅ Role super_admin encontrada:', {
      id: superAdminRole.id,
      name: superAdminRole.name,
      guard_name: superAdminRole.guard_name
    });

    // 3. Atribuir role usando o endpoint correto
    console.log('\n3️⃣ Atribuindo role super_admin ao usuário...');
    try {
      const assignResponse = await api.post(`/usuarios/${userId}/assign-role`, {
        roleId: superAdminRole.id
      });
      console.log('✅ Role atribuída via assign-role endpoint!');
      console.log('📝 Response:', assignResponse.data);
    } catch (error: any) {
      console.log('❌ Erro ao atribuir role:', error.response?.data);
    }

    // 4. Verificar no banco
    console.log('\n4️⃣ Verificando no banco...');
    const modelHasRoles = await prisma.$queryRaw`
      SELECT
        mhr.role_id,
        r.name as role_name,
        r.guard_name
      FROM model_has_roles mhr
      JOIN roles r ON r.id = mhr.role_id
      WHERE mhr.model_type = 'App\\Models\\Usuario'
        AND mhr.model_id = ${userId}
    `;

    if (Array.isArray(modelHasRoles) && modelHasRoles.length > 0) {
      console.log('✅ Roles no banco:');
      modelHasRoles.forEach((role: any) => {
        console.log(`   - ${role.role_name} (ID: ${role.role_id})`);
      });
    } else {
      console.log('⚠️  Ainda sem roles no banco!');
    }

    // 5. Verificar via API
    console.log('\n5️⃣ Verificando via API...');
    const getResponse = await api.get(`/usuarios/${userId}`);
    const usuario = getResponse.data.data || getResponse.data;
    console.log('📝 Roles (API):', usuario.roles);

    // 6. Buscar permissões
    console.log('\n6️⃣ Verificando permissões...');
    const permsResponse = await api.get(`/usuarios/${userId}/permissions`);
    const permsData = permsResponse.data.data || permsResponse.data;
    console.log('📝 Role:', permsData.role?.name);
    console.log('📝 Total permissions:', permsData.permissions?.length || 0);

    console.log('\n' + '='.repeat(80));

    if (modelHasRoles && Array.isArray(modelHasRoles) && modelHasRoles.length > 0) {
      const hasSuperAdmin = modelHasRoles.some((r: any) => r.role_name === 'super_admin');
      if (hasSuperAdmin) {
        console.log('\n✅ SUCESSO! admin@email.com agora é SUPER_ADMIN!');
      } else {
        console.log('\n⚠️  Role atribuída, mas não é super_admin');
      }
    } else {
      console.log('\n❌ PROBLEMA! Role não foi atribuída');
      console.log('\n💡 SUGESTÃO: Tente usar o endpoint de UPDATE com roleId ao invés de roleNames');
    }

  } catch (error: any) {
    console.error('\n❌ Erro:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
}

fixAdminRole().catch(console.error);
