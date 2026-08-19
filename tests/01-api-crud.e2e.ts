// tests/01-api-crud.e2e.ts
// FASE 2: Testes de API - CRUD Básico de Usuários

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

// Variáveis para armazenar dados entre testes
let createdUserId: string | null = null;
let createdUserWithRoleId: string | null = null;
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

  // Tentar fazer login como admin para obter token
  try {
    console.log('🔐 Tentando autenticar como admin...');
    const loginResponse = await api.post('/auth/login', {
      email: process.env.ADMIN_EMAIL || 'admin@email.com',
      senha: process.env.ADMIN_PASSWORD || 'Aupus123!'
    });

    const responseData = loginResponse.data.data || loginResponse.data;
    adminToken = responseData.access_token;

    if (adminToken) {
      api.defaults.headers.common['Authorization'] = `Bearer ${adminToken}`;
      console.log('✅ Autenticado com sucesso\n');
    } else {
      console.log('⚠️  Login retornou mas sem token\n');
    }
  } catch (error: any) {
    console.log('⚠️  Não foi possível autenticar (continuando sem token):', error.response?.data?.message || error.message);
    console.log('   Alguns testes podem falhar se autenticação for obrigatória\n');
  }
}

async function runCrudTests() {
  console.log('📋 FASE 2: TESTES DE API - CRUD BÁSICO\n');
  console.log('='.repeat(80));

  await setup();

  // TEST 7: Criar usuário simples (sem roles/permissions)
  try {
    console.log('\n📋 TEST 7: Criar usuário simples...');

    const userData = {
      nome: 'Usuário Teste Simples',
      email: `teste.simples.${Date.now()}@teste.com`,
      telefone: '11999999999',
      status: 'Ativo'
    };

    const response = await api.post('/usuarios', userData);
    const responseData = response.data.data || response.data;

    if (response.status === 201 && responseData.id) {
      createdUserId = responseData.id;
      results.push({
        test: 'Criar Usuário Simples',
        status: 'PASS',
        message: `Usuário criado com sucesso. ID: ${createdUserId}`,
        data: {
          userId: createdUserId,
          email: responseData.email,
          role: responseData.role || responseData.roles
        }
      });
      console.log('   ✅ PASS - Usuário criado:', createdUserId);
      console.log('   📝 Email:', responseData.email);
      console.log('   📝 Role:', responseData.role || responseData.roles);
    } else {
      results.push({
        test: 'Criar Usuário Simples',
        status: 'FAIL',
        message: 'Resposta inesperada ao criar usuário',
        data: response.data
      });
      console.log('   ❌ FAIL - Resposta inesperada');
    }
  } catch (error: any) {
    results.push({
      test: 'Criar Usuário Simples',
      status: 'FAIL',
      message: `Erro: ${error.response?.data?.message || error.message}`,
      data: error.response?.data
    });
    console.log('   ❌ FAIL - Erro:', error.response?.data?.message || error.message);
  }

  // TEST 8: Criar usuário com roleId
  try {
    console.log('\n📋 TEST 8: Criar usuário com roleId...');

    // Primeiro, buscar roles disponíveis
    const rolesResponse = await api.get('/usuarios/available/roles');
    const roles = rolesResponse.data.data || rolesResponse.data;

    if (!roles || roles.length === 0) {
      throw new Error('Nenhuma role disponível no sistema');
    }

    const firstRoleId = roles[0].id;

    const userData = {
      nome: 'Usuário Teste Com Role',
      email: `teste.role.${Date.now()}@teste.com`,
      telefone: '11988888888',
      status: 'Ativo',
      roleId: firstRoleId
    };

    const response = await api.post('/usuarios', userData);
    const responseData = response.data.data || response.data;

    if (response.status === 201 && responseData.id) {
      createdUserWithRoleId = responseData.id;
      results.push({
        test: 'Criar Usuário com RoleId',
        status: 'PASS',
        message: `Usuário criado com roleId ${firstRoleId}`,
        data: {
          userId: createdUserWithRoleId,
          roleId: firstRoleId,
          roleName: roles[0].name
        }
      });
      console.log('   ✅ PASS - Usuário criado com role:', roles[0].name);
    } else {
      results.push({
        test: 'Criar Usuário com RoleId',
        status: 'FAIL',
        message: 'Resposta inesperada',
        data: response.data
      });
      console.log('   ❌ FAIL - Resposta inesperada');
    }
  } catch (error: any) {
    results.push({
      test: 'Criar Usuário com RoleId',
      status: 'FAIL',
      message: `Erro: ${error.response?.data?.message || error.message}`,
      data: error.response?.data
    });
    console.log('   ❌ FAIL - Erro:', error.response?.data?.message || error.message);
  }

  // TEST 9: Criar usuário com permissionIds
  try {
    console.log('\n📋 TEST 9: Criar usuário com permissionIds...');

    // Buscar permissions disponíveis
    const permsResponse = await api.get('/usuarios/available/permissions');
    const permissions = permsResponse.data.data || permsResponse.data;

    if (!permissions || permissions.length === 0) {
      throw new Error('Nenhuma permission disponível no sistema');
    }

    const permissionIds = permissions.slice(0, 3).map((p: any) => p.id);

    const userData = {
      nome: 'Usuário Teste Com Permissions',
      email: `teste.perms.${Date.now()}@teste.com`,
      telefone: '11977777777',
      status: 'Ativo',
      permissionIds: permissionIds
    };

    const response = await api.post('/usuarios', userData);
    const responseData = response.data.data || response.data;

    if (response.status === 201 && responseData.id) {
      results.push({
        test: 'Criar Usuário com PermissionIds',
        status: 'PASS',
        message: `Usuário criado com ${permissionIds.length} permissions`,
        data: {
          userId: responseData.id,
          permissionIds: permissionIds
        }
      });
      console.log('   ✅ PASS - Usuário criado com permissions');
    } else {
      results.push({
        test: 'Criar Usuário com PermissionIds',
        status: 'FAIL',
        message: 'Resposta inesperada',
        data: response.data
      });
      console.log('   ❌ FAIL - Resposta inesperada');
    }
  } catch (error: any) {
    results.push({
      test: 'Criar Usuário com PermissionIds',
      status: 'FAIL',
      message: `Erro: ${error.response?.data?.message || error.message}`,
      data: error.response?.data
    });
    console.log('   ❌ FAIL - Erro:', error.response?.data?.message || error.message);
  }

  // TEST 10: Listar usuários
  try {
    console.log('\n📋 TEST 10: Listar usuários...');

    const response = await api.get('/usuarios', {
      params: { page: 1, limit: 10 }
    });

    // Handle nested wrapper: {success: true, data: {data: [...], pagination: {...}}}
    const outerData = response.data.data || response.data;
    const usuarios = outerData.data || outerData;
    const pagination = outerData.pagination;
    const isArray = Array.isArray(usuarios);

    if (response.status === 200 && isArray) {
      results.push({
        test: 'Listar Usuários',
        status: 'PASS',
        message: `Listagem retornou ${usuarios.length} usuários`,
        data: {
          total: pagination?.total || usuarios.length,
          returned: usuarios.length,
          page: pagination?.page,
          totalPages: pagination?.totalPages
        }
      });
      console.log('   ✅ PASS - Listagem funcionando');
      console.log('   📝 Total:', pagination?.total || 'N/A');
      console.log('   📝 Retornados:', usuarios.length);
      console.log('   📝 Página:', pagination?.page || 'N/A');
    } else {
      results.push({
        test: 'Listar Usuários',
        status: 'FAIL',
        message: 'Formato de resposta inesperado',
        data: response.data
      });
      console.log('   ❌ FAIL - Formato inesperado');
    }
  } catch (error: any) {
    results.push({
      test: 'Listar Usuários',
      status: 'FAIL',
      message: `Erro: ${error.response?.data?.message || error.message}`,
      data: error.response?.data
    });
    console.log('   ❌ FAIL - Erro:', error.response?.data?.message || error.message);
  }

  // TEST 11: Buscar usuário por ID
  if (createdUserId) {
    try {
      console.log('\n📋 TEST 11: Buscar usuário por ID...');

      const response = await api.get(`/usuarios/${createdUserId}`);
      const responseData = response.data.data || response.data;

      if (response.status === 200 && responseData.id === createdUserId) {
        results.push({
          test: 'Buscar Usuário por ID',
          status: 'PASS',
          message: `Usuário encontrado: ${responseData.nome}`,
          data: {
            id: responseData.id,
            nome: responseData.nome,
            email: responseData.email
          }
        });
        console.log('   ✅ PASS - Usuário encontrado');
      } else {
        results.push({
          test: 'Buscar Usuário por ID',
          status: 'FAIL',
          message: 'Dados do usuário não correspondem',
          data: response.data
        });
        console.log('   ❌ FAIL - Dados não correspondem');
      }
    } catch (error: any) {
      results.push({
        test: 'Buscar Usuário por ID',
        status: 'FAIL',
        message: `Erro: ${error.response?.data?.message || error.message}`,
        data: error.response?.data
      });
      console.log('   ❌ FAIL - Erro:', error.response?.data?.message || error.message);
    }
  } else {
    results.push({
      test: 'Buscar Usuário por ID',
      status: 'FAIL',
      message: 'Teste pulado: nenhum usuário foi criado no TEST 7'
    });
    console.log('\n📋 TEST 11: ⏭️  SKIP - Nenhum usuário criado anteriormente');
  }

  // TEST 12: Atualizar usuário
  if (createdUserId) {
    try {
      console.log('\n📋 TEST 12: Atualizar usuário...');

      const updateData = {
        nome: 'Usuário Teste ATUALIZADO',
        telefone: '11966666666'
      };

      const response = await api.patch(`/usuarios/${createdUserId}`, updateData);
      const responseData = response.data.data || response.data;

      if (response.status === 200 && responseData.nome === updateData.nome) {
        results.push({
          test: 'Atualizar Usuário',
          status: 'PASS',
          message: 'Usuário atualizado com sucesso',
          data: {
            id: responseData.id,
            nome: responseData.nome,
            telefone: responseData.telefone
          }
        });
        console.log('   ✅ PASS - Usuário atualizado');
      } else {
        results.push({
          test: 'Atualizar Usuário',
          status: 'FAIL',
          message: 'Atualização não refletida na resposta',
          data: response.data
        });
        console.log('   ❌ FAIL - Atualização não refletida');
      }
    } catch (error: any) {
      results.push({
        test: 'Atualizar Usuário',
        status: 'FAIL',
        message: `Erro: ${error.response?.data?.message || error.message}`,
        data: error.response?.data
      });
      console.log('   ❌ FAIL - Erro:', error.response?.data?.message || error.message);
    }
  } else {
    results.push({
      test: 'Atualizar Usuário',
      status: 'FAIL',
      message: 'Teste pulado: nenhum usuário foi criado no TEST 7'
    });
    console.log('\n📋 TEST 12: ⏭️  SKIP - Nenhum usuário criado anteriormente');
  }

  // TEST 13: Deletar usuário (soft delete)
  if (createdUserId) {
    try {
      console.log('\n📋 TEST 13: Deletar usuário (soft delete)...');

      const response = await api.delete(`/usuarios/${createdUserId}`);

      if (response.status === 200) {
        // Verificar se realmente foi soft delete
        try {
          await api.get(`/usuarios/${createdUserId}`);
          results.push({
            test: 'Deletar Usuário',
            status: 'FAIL',
            message: 'Usuário ainda acessível após delete (soft delete pode não estar funcionando)',
          });
          console.log('   ❌ FAIL - Usuário ainda acessível');
        } catch (error: any) {
          if (error.response?.status === 404) {
            results.push({
              test: 'Deletar Usuário',
              status: 'PASS',
              message: 'Usuário deletado com sucesso (soft delete)',
            });
            console.log('   ✅ PASS - Soft delete funcionando');
          } else {
            throw error;
          }
        }
      } else {
        results.push({
          test: 'Deletar Usuário',
          status: 'FAIL',
          message: `Status inesperado: ${response.status}`,
          data: response.data
        });
        console.log('   ❌ FAIL - Status inesperado:', response.status);
      }
    } catch (error: any) {
      results.push({
        test: 'Deletar Usuário',
        status: 'FAIL',
        message: `Erro: ${error.response?.data?.message || error.message}`,
        data: error.response?.data
      });
      console.log('   ❌ FAIL - Erro:', error.response?.data?.message || error.message);
    }
  } else {
    results.push({
      test: 'Deletar Usuário',
      status: 'FAIL',
      message: 'Teste pulado: nenhum usuário foi criado no TEST 7'
    });
    console.log('\n📋 TEST 13: ⏭️  SKIP - Nenhum usuário criado anteriormente');
  }

  // Resumo final
  console.log('\n' + '='.repeat(80));
  console.log('📊 RESUMO DOS TESTES DE CRUD\n');

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
  runCrudTests()
    .then((results) => {
      const failed = results.filter(r => r.status === 'FAIL').length;
      process.exit(failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('❌ Erro fatal ao executar testes:', error);
      process.exit(1);
    });
}

export { runCrudTests, TestResult };
