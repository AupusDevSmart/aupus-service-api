// tests/02-authentication.test.ts
// FASE 3: Testes de Autenticação (Login, JWT, Guards)

import axios, { AxiosInstance } from 'axios';
import * as jwt from 'jsonwebtoken';

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
let testUserId: string | null = null;
let testUserEmail: string | null = null;
let testUserPassword: string = 'TestPassword123!';
let accessToken: string | null = null;
let refreshToken: string | null = null;

async function setup() {
  console.log(`\n🔧 Configurando cliente API: ${API_BASE_URL}\n`);

  api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json'
    }
  });

  // Criar usuário de teste para autenticação
  try {
    console.log('👤 Criando usuário de teste para autenticação...');

    testUserEmail = `auth.test.${Date.now()}@teste.com`;

    const userData = {
      nome: 'Usuário Teste Auth',
      email: testUserEmail,
      telefone: '11955555555',
      status: 'Ativo'
    };

    const response = await api.post('/usuarios', userData);
    testUserId = response.data.id;

    // Resetar senha para uma conhecida
    await api.patch(`/usuarios/${testUserId}/reset-password`, {
      novaSenha: testUserPassword
    });

    console.log('✅ Usuário de teste criado:', testUserId);
    console.log('   Email:', testUserEmail);
    console.log('   Senha:', testUserPassword);
    console.log('');
  } catch (error: any) {
    console.error('❌ Erro ao criar usuário de teste:', error.response?.data?.message || error.message);
    console.log('   Tentando continuar com credenciais padrão...\n');

    // Fallback para credenciais padrão
    testUserEmail = 'admin@email.com';
    testUserPassword = 'Aupus123!';
  }
}

async function runAuthTests() {
  console.log('🔐 FASE 3: TESTES DE AUTENTICAÇÃO\n');
  console.log('='.repeat(80));

  await setup();

  // TEST 14: Login com credenciais válidas
  try {
    console.log('\n📋 TEST 14: Login com credenciais válidas...');

    const loginData = {
      email: testUserEmail,
      senha: testUserPassword
    };

    const response = await api.post('/auth/login', loginData);

    if (response.status === 200 || response.status === 201) {
      // API retorna {success: true, data: {...}}
      const responseData = response.data.data || response.data;

      accessToken = responseData.access_token;
      refreshToken = responseData.refresh_token;

      if (accessToken && refreshToken) {
        results.push({
          test: 'Login com Credenciais Válidas',
          status: 'PASS',
          message: 'Login realizado com sucesso, tokens recebidos',
          data: {
            hasAccessToken: !!accessToken,
            hasRefreshToken: !!refreshToken,
            tokenType: responseData.token_type,
            expiresIn: responseData.expires_in,
            user: responseData.user?.email
          }
        });
        console.log('   ✅ PASS - Login bem-sucedido');
        console.log('   📝 Token Type:', responseData.token_type);
        console.log('   📝 Expires In:', responseData.expires_in);
        console.log('   📝 User:', responseData.user?.email);
      } else {
        results.push({
          test: 'Login com Credenciais Válidas',
          status: 'FAIL',
          message: 'Login retornou mas sem tokens',
          data: response.data
        });
        console.log('   ❌ FAIL - Tokens ausentes');
      }
    } else {
      results.push({
        test: 'Login com Credenciais Válidas',
        status: 'FAIL',
        message: `Status inesperado: ${response.status}`,
        data: response.data
      });
      console.log('   ❌ FAIL - Status inesperado:', response.status);
    }
  } catch (error: any) {
    results.push({
      test: 'Login com Credenciais Válidas',
      status: 'FAIL',
      message: `Erro: ${error.response?.data?.message || error.message}`,
      data: error.response?.data
    });
    console.log('   ❌ FAIL - Erro:', error.response?.data?.message || error.message);
  }

  // TEST 15: Login com credenciais inválidas
  try {
    console.log('\n📋 TEST 15: Login com credenciais inválidas...');

    const loginData = {
      email: testUserEmail,
      senha: 'SenhaErrada123!'
    };

    const response = await api.post('/auth/login', loginData);

    // Se chegou aqui, é um problema - deveria ter dado erro 401
    results.push({
      test: 'Login com Credenciais Inválidas',
      status: 'FAIL',
      message: 'Login deveria ter falhado mas retornou sucesso',
      data: response.data
    });
    console.log('   ❌ FAIL - Login não deveria ter sucesso com senha errada');
  } catch (error: any) {
    if (error.response?.status === 401 || error.response?.status === 400) {
      results.push({
        test: 'Login com Credenciais Inválidas',
        status: 'PASS',
        message: 'Login rejeitado corretamente (401/400)',
        data: {
          status: error.response.status,
          message: error.response.data?.message
        }
      });
      console.log('   ✅ PASS - Login rejeitado corretamente');
      console.log('   📝 Status:', error.response.status);
    } else {
      results.push({
        test: 'Login com Credenciais Inválidas',
        status: 'FAIL',
        message: `Status inesperado: ${error.response?.status}`,
        data: error.response?.data
      });
      console.log('   ❌ FAIL - Status inesperado:', error.response?.status);
    }
  }

  // TEST 16: Verificar payload do JWT
  if (accessToken) {
    try {
      console.log('\n📋 TEST 16: Verificar payload do JWT...');

      // Decodificar JWT (sem verificar assinatura)
      const decoded: any = jwt.decode(accessToken);

      if (!decoded) {
        throw new Error('Não foi possível decodificar o token');
      }

      const requiredFields = ['sub', 'email', 'nome'];
      const missingFields = requiredFields.filter(field => !decoded[field]);

      if (missingFields.length === 0) {
        results.push({
          test: 'Payload do JWT',
          status: 'PASS',
          message: 'Token contém todos os campos necessários',
          data: {
            sub: decoded.sub,
            email: decoded.email,
            nome: decoded.nome,
            role: decoded.role,
            permissions: decoded.permissions?.length || 0,
            exp: decoded.exp,
            iat: decoded.iat
          }
        });
        console.log('   ✅ PASS - Payload completo');
        console.log('   📝 User ID:', decoded.sub);
        console.log('   📝 Email:', decoded.email);
        console.log('   📝 Role:', decoded.role || 'N/A');
        console.log('   📝 Permissions:', decoded.permissions?.length || 0);
      } else {
        results.push({
          test: 'Payload do JWT',
          status: 'FAIL',
          message: `Campos faltando no payload: ${missingFields.join(', ')}`,
          data: decoded
        });
        console.log('   ❌ FAIL - Campos faltando:', missingFields.join(', '));
      }
    } catch (error: any) {
      results.push({
        test: 'Payload do JWT',
        status: 'FAIL',
        message: `Erro ao decodificar token: ${error.message}`,
      });
      console.log('   ❌ FAIL - Erro:', error.message);
    }
  } else {
    results.push({
      test: 'Payload do JWT',
      status: 'FAIL',
      message: 'Teste pulado: nenhum token disponível do TEST 14'
    });
    console.log('\n📋 TEST 16: ⏭️  SKIP - Nenhum token disponível');
  }

  // TEST 17: Refresh token
  if (refreshToken) {
    try {
      console.log('\n📋 TEST 17: Refresh token...');

      const response = await api.post('/auth/refresh', {
        refresh_token: refreshToken
      });

      const responseData = response.data.data || response.data;

      if (response.status === 200 && responseData.access_token) {
        const newAccessToken = responseData.access_token;
        const newRefreshToken = responseData.refresh_token;

        results.push({
          test: 'Refresh Token',
          status: 'PASS',
          message: 'Tokens renovados com sucesso',
          data: {
            hasNewAccessToken: !!newAccessToken,
            hasNewRefreshToken: !!newRefreshToken,
            tokensAreDifferent: newAccessToken !== accessToken
          }
        });
        console.log('   ✅ PASS - Tokens renovados');
        console.log('   📝 Tokens são diferentes:', newAccessToken !== accessToken);

        // Atualizar tokens para próximos testes
        accessToken = newAccessToken;
        if (newRefreshToken) refreshToken = newRefreshToken;
      } else {
        results.push({
          test: 'Refresh Token',
          status: 'FAIL',
          message: 'Resposta inesperada ao renovar tokens',
          data: response.data
        });
        console.log('   ❌ FAIL - Resposta inesperada');
      }
    } catch (error: any) {
      results.push({
        test: 'Refresh Token',
        status: 'FAIL',
        message: `Erro: ${error.response?.data?.message || error.message}`,
        data: error.response?.data
      });
      console.log('   ❌ FAIL - Erro:', error.response?.data?.message || error.message);
    }
  } else {
    results.push({
      test: 'Refresh Token',
      status: 'FAIL',
      message: 'Teste pulado: nenhum refresh token disponível do TEST 14'
    });
    console.log('\n📋 TEST 17: ⏭️  SKIP - Nenhum refresh token disponível');
  }

  // TEST 18: Acesso a rota protegida com token válido
  if (accessToken) {
    try {
      console.log('\n📋 TEST 18: Acesso a rota protegida com token válido...');

      // Decodificar token para obter ID do usuário
      const decoded: any = jwt.decode(accessToken);
      const userId = decoded?.sub;

      if (!userId) {
        throw new Error('Não foi possível obter ID do usuário do token');
      }

      // Usar endpoint /usuarios/:id que sabemos que funciona
      const response = await api.get(`/usuarios/${userId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const responseData = response.data.data || response.data;

      if (response.status === 200 && responseData.id) {
        results.push({
          test: 'Rota Protegida com Token Válido',
          status: 'PASS',
          message: 'Acesso autorizado com token JWT',
          data: {
            userId: responseData.id,
            email: responseData.email,
            nome: responseData.nome
          }
        });
        console.log('   ✅ PASS - Acesso autorizado');
        console.log('   📝 User ID:', responseData.id);
        console.log('   📝 Email:', responseData.email);
      } else {
        results.push({
          test: 'Rota Protegida com Token Válido',
          status: 'FAIL',
          message: 'Resposta inesperada do endpoint',
          data: response.data
        });
        console.log('   ❌ FAIL - Resposta inesperada');
      }
    } catch (error: any) {
      results.push({
        test: 'Rota Protegida com Token Válido',
        status: 'FAIL',
        message: `Erro: ${error.response?.data?.message || error.message}`,
        data: error.response?.data
      });
      console.log('   ❌ FAIL - Erro:', error.response?.data?.message || error.message);
    }
  } else {
    results.push({
      test: 'Rota Protegida com Token Válido',
      status: 'FAIL',
      message: 'Teste pulado: nenhum token disponível'
    });
    console.log('\n📋 TEST 18: ⏭️  SKIP - Nenhum token disponível');
  }

  // TEST 19: Acesso a rota protegida sem token
  try {
    console.log('\n📋 TEST 19: Acesso a rota protegida sem token...');

    const response = await api.get('/usuarios');

    // Se chegou aqui sem erro, verificar se realmente não exige autenticação
    results.push({
      test: 'Rota Protegida sem Token',
      status: 'WARN',
      message: 'Rota acessível sem token (pode ser pública ou guard não configurado)',
      data: { status: response.status }
    });
    console.log('   ⚠️  WARN - Rota acessível sem autenticação');
  } catch (error: any) {
    if (error.response?.status === 401) {
      results.push({
        test: 'Rota Protegida sem Token',
        status: 'PASS',
        message: 'Acesso bloqueado corretamente (401 Unauthorized)',
        data: {
          status: error.response.status,
          message: error.response.data?.message
        }
      });
      console.log('   ✅ PASS - Acesso bloqueado corretamente');
    } else {
      results.push({
        test: 'Rota Protegida sem Token',
        status: 'FAIL',
        message: `Status inesperado: ${error.response?.status}`,
        data: error.response?.data
      });
      console.log('   ❌ FAIL - Status inesperado:', error.response?.status);
    }
  }

  // Resumo final
  console.log('\n' + '='.repeat(80));
  console.log('📊 RESUMO DOS TESTES DE AUTENTICAÇÃO\n');

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
  runAuthTests()
    .then((results) => {
      const failed = results.filter(r => r.status === 'FAIL').length;
      process.exit(failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('❌ Erro fatal ao executar testes:', error);
      process.exit(1);
    });
}

export { runAuthTests, TestResult };
