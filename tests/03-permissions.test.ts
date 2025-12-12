// tests/03-permissions.test.ts
// FASE 4: Testes de Roles e Permissions

import axios, { AxiosInstance } from 'axios';

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  data?: any;
}

const results: TestResult[] = [];

// Configuração da API
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api/v1';
let api: AxiosInstance;

// Variáveis compartilhadas entre testes
let testUserId: string | null = null;
let firstRoleId: number | null = null;
let firstPermissionId: number | null = null;
let adminToken: string | null = null;

async function setup() {
  console.log(`\n🔧 Configurando cliente API: ${API_BASE_URL}\n`);

  api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json'
    }
  });

  // Tentar autenticar como admin
  try {
    console.log('🔐 Autenticando como admin...');
    const loginResponse = await api.post('/auth/login', {
      email: process.env.ADMIN_EMAIL || 'admin@email.com',
      senha: process.env.ADMIN_PASSWORD || 'Aupus123!'
    });

    const responseData = loginResponse.data.data || loginResponse.data;
    adminToken = responseData.access_token;
    if (adminToken) {
      api.defaults.headers.common['Authorization'] = `Bearer ${adminToken}`;
      console.log('✅ Autenticado com sucesso\n');
    }
  } catch (error: any) {
    console.log('⚠️  Não foi possível autenticar:', error.response?.data?.message || error.message);
    console.log('   Alguns testes podem falhar\n');
  }

  // Criar usuário de teste
  try {
    console.log('👤 Criando usuário de teste...');
    const userData = {
      nome: 'Usuário Teste Permissions',
      email: `perms.test.${Date.now()}@teste.com`,
      telefone: '11944444444',
      status: 'Ativo'
    };

    const response = await api.post('/usuarios', userData);
    const responseData = response.data.data || response.data;
    testUserId = responseData.id;
    console.log('✅ Usuário de teste criado:', testUserId);
    console.log('');
  } catch (error: any) {
    console.error('❌ Erro ao criar usuário de teste:', error.response?.data?.message || error.message);
    console.log('');
  }
}

async function runPermissionsTests() {
  console.log('🔒 FASE 4: TESTES DE ROLES E PERMISSIONS\n');
  console.log('='.repeat(80));

  await setup();

  // TEST 20: Atribuir role a usuário
  if (testUserId) {
    try {
      console.log('\n📋 TEST 20: Atribuir role a usuário...');

      // Buscar roles disponíveis
      const rolesResponse = await api.get('/usuarios/available/roles');
      const roles = rolesResponse.data.data || rolesResponse.data;

      if (!roles || roles.length === 0) {
        throw new Error('Nenhuma role disponível');
      }

      firstRoleId = roles[0].id;
      const roleName = roles[0].name;

      const response = await api.post(`/usuarios/${testUserId}/assign-role`, {
        roleId: firstRoleId
      });

      if (response.status === 200) {
        results.push({
          test: 'Atribuir Role',
          status: 'PASS',
          message: `Role "${roleName}" atribuída com sucesso`,
          data: {
            roleId: firstRoleId,
            roleName: roleName
          }
        });
        console.log('   ✅ PASS - Role atribuída:', roleName);
      } else {
        results.push({
          test: 'Atribuir Role',
          status: 'FAIL',
          message: `Status inesperado: ${response.status}`,
          data: response.data
        });
        console.log('   ❌ FAIL - Status inesperado');
      }
    } catch (error: any) {
      results.push({
        test: 'Atribuir Role',
        status: 'FAIL',
        message: `Erro: ${error.response?.data?.message || error.message}`,
        data: error.response?.data
      });
      console.log('   ❌ FAIL - Erro:', error.response?.data?.message || error.message);
    }
  } else {
    results.push({
      test: 'Atribuir Role',
      status: 'FAIL',
      message: 'Teste pulado: usuário de teste não foi criado'
    });
    console.log('\n📋 TEST 20: ⏭️  SKIP - Usuário não criado');
  }

  // TEST 21: Atribuir permissão direta
  if (testUserId) {
    try {
      console.log('\n📋 TEST 21: Atribuir permissão direta...');

      // Buscar permissions disponíveis
      const permsResponse = await api.get('/usuarios/available/permissions');
      const permissions = permsResponse.data.data || permsResponse.data;

      if (!permissions || permissions.length === 0) {
        throw new Error('Nenhuma permission disponível');
      }

      firstPermissionId = permissions[0].id;
      const permissionName = permissions[0].name;

      const response = await api.post(`/usuarios/${testUserId}/assign-permission`, {
        permissionId: firstPermissionId
      });

      if (response.status === 200) {
        results.push({
          test: 'Atribuir Permissão Direta',
          status: 'PASS',
          message: `Permission "${permissionName}" atribuída com sucesso`,
          data: {
            permissionId: firstPermissionId,
            permissionName: permissionName
          }
        });
        console.log('   ✅ PASS - Permission atribuída:', permissionName);
      } else {
        results.push({
          test: 'Atribuir Permissão Direta',
          status: 'FAIL',
          message: `Status inesperado: ${response.status}`,
          data: response.data
        });
        console.log('   ❌ FAIL - Status inesperado');
      }
    } catch (error: any) {
      results.push({
        test: 'Atribuir Permissão Direta',
        status: 'FAIL',
        message: `Erro: ${error.response?.data?.message || error.message}`,
        data: error.response?.data
      });
      console.log('   ❌ FAIL - Erro:', error.response?.data?.message || error.message);
    }
  } else {
    results.push({
      test: 'Atribuir Permissão Direta',
      status: 'FAIL',
      message: 'Teste pulado: usuário de teste não foi criado'
    });
    console.log('\n📋 TEST 21: ⏭️  SKIP - Usuário não criado');
  }

  // TEST 22: Remover permissão direta
  if (testUserId && firstPermissionId) {
    try {
      console.log('\n📋 TEST 22: Remover permissão direta...');

      const response = await api.delete(`/usuarios/${testUserId}/remove-permission/${firstPermissionId}`);

      if (response.status === 200) {
        results.push({
          test: 'Remover Permissão Direta',
          status: 'PASS',
          message: 'Permission removida com sucesso',
          data: { permissionId: firstPermissionId }
        });
        console.log('   ✅ PASS - Permission removida');
      } else {
        results.push({
          test: 'Remover Permissão Direta',
          status: 'FAIL',
          message: `Status inesperado: ${response.status}`,
          data: response.data
        });
        console.log('   ❌ FAIL - Status inesperado');
      }
    } catch (error: any) {
      results.push({
        test: 'Remover Permissão Direta',
        status: 'FAIL',
        message: `Erro: ${error.response?.data?.message || error.message}`,
        data: error.response?.data
      });
      console.log('   ❌ FAIL - Erro:', error.response?.data?.message || error.message);
    }
  } else {
    results.push({
      test: 'Remover Permissão Direta',
      status: 'FAIL',
      message: 'Teste pulado: usuário ou permission não disponível'
    });
    console.log('\n📋 TEST 22: ⏭️  SKIP - Dados não disponíveis');
  }

  // TEST 23: Sincronizar permissões
  if (testUserId) {
    try {
      console.log('\n📋 TEST 23: Sincronizar permissões...');

      // Buscar algumas permissions
      const permsResponse = await api.get('/usuarios/available/permissions');
      const permissions = permsResponse.data.data || permsResponse.data;

      const permissionIds = permissions.slice(0, 3).map((p: any) => p.id);

      const response = await api.post(`/usuarios/${testUserId}/sync-permissions`, {
        permissionIds: permissionIds
      });

      if (response.status === 200) {
        results.push({
          test: 'Sincronizar Permissões',
          status: 'PASS',
          message: `${permissionIds.length} permissions sincronizadas`,
          data: {
            count: permissionIds.length,
            permissionIds: permissionIds
          }
        });
        console.log('   ✅ PASS - Permissions sincronizadas:', permissionIds.length);
      } else {
        results.push({
          test: 'Sincronizar Permissões',
          status: 'FAIL',
          message: `Status inesperado: ${response.status}`,
          data: response.data
        });
        console.log('   ❌ FAIL - Status inesperado');
      }
    } catch (error: any) {
      results.push({
        test: 'Sincronizar Permissões',
        status: 'FAIL',
        message: `Erro: ${error.response?.data?.message || error.message}`,
        data: error.response?.data
      });
      console.log('   ❌ FAIL - Erro:', error.response?.data?.message || error.message);
    }
  } else {
    results.push({
      test: 'Sincronizar Permissões',
      status: 'FAIL',
      message: 'Teste pulado: usuário de teste não foi criado'
    });
    console.log('\n📋 TEST 23: ⏭️  SKIP - Usuário não criado');
  }

  // TEST 24: Buscar permissões do usuário
  if (testUserId) {
    try {
      console.log('\n📋 TEST 24: Buscar permissões do usuário...');

      const response = await api.get(`/usuarios/${testUserId}/permissions`);

      if (response.status === 200) {
        const data = response.data.data || response.data;

        results.push({
          test: 'Buscar Permissões do Usuário',
          status: 'PASS',
          message: 'Permissões obtidas com sucesso',
          data: {
            hasRole: !!data.role,
            roleName: data.role?.name,
            totalPermissions: data.permissions?.length || 0,
            permissionNames: data.permissionNames?.slice(0, 5) || []
          }
        });
        console.log('   ✅ PASS - Permissões obtidas');
        console.log('   📝 Role:', data.role?.name || 'N/A');
        console.log('   📝 Total Permissions:', data.permissions?.length || 0);
      } else {
        results.push({
          test: 'Buscar Permissões do Usuário',
          status: 'FAIL',
          message: `Status inesperado: ${response.status}`,
          data: response.data
        });
        console.log('   ❌ FAIL - Status inesperado');
      }
    } catch (error: any) {
      results.push({
        test: 'Buscar Permissões do Usuário',
        status: 'FAIL',
        message: `Erro: ${error.response?.data?.message || error.message}`,
        data: error.response?.data
      });
      console.log('   ❌ FAIL - Erro:', error.response?.data?.message || error.message);
    }
  } else {
    results.push({
      test: 'Buscar Permissões do Usuário',
      status: 'FAIL',
      message: 'Teste pulado: usuário de teste não foi criado'
    });
    console.log('\n📋 TEST 24: ⏭️  SKIP - Usuário não criado');
  }

  // TEST 25: Verificar permissão específica
  if (testUserId) {
    try {
      console.log('\n📋 TEST 25: Verificar permissão específica...');

      // Buscar primeiro as permissions do usuário
      const userPermsResponse = await api.get(`/usuarios/${testUserId}/permissions`);
      const userPermsData = userPermsResponse.data.data || userPermsResponse.data;
      const userPermissions = userPermsData.permissionNames || [];

      if (userPermissions.length === 0) {
        throw new Error('Usuário não tem permissions para testar');
      }

      const permissionToCheck = userPermissions[0];

      const response = await api.post(`/usuarios/${testUserId}/check-permission`, {
        permissionName: permissionToCheck
      });

      if (response.status === 200) {
        const responseData = response.data.data || response.data;
        const hasPermission = responseData.hasPermission;

        if (hasPermission === true) {
          results.push({
            test: 'Verificar Permissão Específica',
            status: 'PASS',
            message: `Verificação funcionando corretamente`,
            data: {
              permission: permissionToCheck,
              hasPermission: hasPermission
            }
          });
          console.log('   ✅ PASS - Verificação correta');
          console.log('   📝 Permission:', permissionToCheck);
        } else {
          results.push({
            test: 'Verificar Permissão Específica',
            status: 'FAIL',
            message: 'Usuário deveria ter a permission mas check retornou false',
            data: {
              permission: permissionToCheck,
              hasPermission: hasPermission
            }
          });
          console.log('   ❌ FAIL - Check inconsistente');
        }
      } else {
        results.push({
          test: 'Verificar Permissão Específica',
          status: 'FAIL',
          message: `Status inesperado: ${response.status}`,
          data: response.data
        });
        console.log('   ❌ FAIL - Status inesperado');
      }
    } catch (error: any) {
      results.push({
        test: 'Verificar Permissão Específica',
        status: 'FAIL',
        message: `Erro: ${error.response?.data?.message || error.message}`,
        data: error.response?.data
      });
      console.log('   ❌ FAIL - Erro:', error.response?.data?.message || error.message);
    }
  } else {
    results.push({
      test: 'Verificar Permissão Específica',
      status: 'FAIL',
      message: 'Teste pulado: usuário de teste não foi criado'
    });
    console.log('\n📋 TEST 25: ⏭️  SKIP - Usuário não criado');
  }

  // TEST 26: Verificar múltiplas permissões
  if (testUserId) {
    try {
      console.log('\n📋 TEST 26: Verificar múltiplas permissões...');

      const userPermsResponse = await api.get(`/usuarios/${testUserId}/permissions`);
      const userPermsData = userPermsResponse.data.data || userPermsResponse.data;
      const userPermissions = userPermsData.permissionNames || [];

      if (userPermissions.length < 2) {
        throw new Error('Usuário não tem permissions suficientes para testar');
      }

      const permissionsToCheck = userPermissions.slice(0, 2);

      const response = await api.post(`/usuarios/${testUserId}/check-permissions`, {
        permissionNames: permissionsToCheck,
        mode: 'all'
      });

      if (response.status === 200) {
        const responseData = response.data.data || response.data;
        const hasPermissions = responseData.hasPermissions;
        const details = responseData.details;

        results.push({
          test: 'Verificar Múltiplas Permissões',
          status: 'PASS',
          message: 'Verificação de múltiplas permissions funcionando',
          data: {
            permissions: permissionsToCheck,
            hasPermissions: hasPermissions,
            details: details
          }
        });
        console.log('   ✅ PASS - Verificação múltipla funcionando');
        console.log('   📝 Mode: all');
        console.log('   📝 Result:', hasPermissions);
      } else {
        results.push({
          test: 'Verificar Múltiplas Permissões',
          status: 'FAIL',
          message: `Status inesperado: ${response.status}`,
          data: response.data
        });
        console.log('   ❌ FAIL - Status inesperado');
      }
    } catch (error: any) {
      results.push({
        test: 'Verificar Múltiplas Permissões',
        status: 'FAIL',
        message: `Erro: ${error.response?.data?.message || error.message}`,
        data: error.response?.data
      });
      console.log('   ❌ FAIL - Erro:', error.response?.data?.message || error.message);
    }
  } else {
    results.push({
      test: 'Verificar Múltiplas Permissões',
      status: 'FAIL',
      message: 'Teste pulado: usuário de teste não foi criado'
    });
    console.log('\n📋 TEST 26: ⏭️  SKIP - Usuário não criado');
  }

  // TEST 27: Testar categorização de permissões
  if (testUserId) {
    try {
      console.log('\n📋 TEST 27: Testar categorização de permissões...');

      const response = await api.get(`/usuarios/${testUserId}/permissions/categorized`);

      if (response.status === 200) {
        const responseData = response.data.data || response.data;
        const categories = Object.keys(responseData);

        results.push({
          test: 'Categorização de Permissões',
          status: 'PASS',
          message: `Permissions categorizadas em ${categories.length} categorias`,
          data: {
            categories: categories,
            sample: categories.slice(0, 3)
          }
        });
        console.log('   ✅ PASS - Categorização funcionando');
        console.log('   📝 Categorias encontradas:', categories.length);
        console.log('   📝 Exemplos:', categories.slice(0, 3).join(', '));
      } else {
        results.push({
          test: 'Categorização de Permissões',
          status: 'FAIL',
          message: `Status inesperado: ${response.status}`,
          data: response.data
        });
        console.log('   ❌ FAIL - Status inesperado');
      }
    } catch (error: any) {
      results.push({
        test: 'Categorização de Permissões',
        status: 'FAIL',
        message: `Erro: ${error.response?.data?.message || error.message}`,
        data: error.response?.data
      });
      console.log('   ❌ FAIL - Erro:', error.response?.data?.message || error.message);
    }
  } else {
    results.push({
      test: 'Categorização de Permissões',
      status: 'FAIL',
      message: 'Teste pulado: usuário de teste não foi criado'
    });
    console.log('\n📋 TEST 27: ⏭️  SKIP - Usuário não criado');
  }

  // Resumo final
  console.log('\n' + '='.repeat(80));
  console.log('📊 RESUMO DOS TESTES DE PERMISSIONS\n');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;

  console.log(`✅ PASS: ${passed}`);
  console.log(`❌ FAIL: ${failed}`);
  console.log(`⚠️  WARN: ${warned}`);
  console.log(`📝 TOTAL: ${results.length}`);

  console.log('\n' + '='.repeat(80));

  return results;
}

// Executar testes se chamado diretamente
if (require.main === module) {
  runPermissionsTests()
    .then((results) => {
      const failed = results.filter(r => r.status === 'FAIL').length;
      process.exit(failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('❌ Erro fatal ao executar testes:', error);
      process.exit(1);
    });
}

export { runPermissionsTests, TestResult };
