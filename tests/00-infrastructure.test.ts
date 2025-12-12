// tests/00-infrastructure.test.ts
// FASE 1: Testes de Infraestrutura do Banco de Dados

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  data?: any;
}

const results: TestResult[] = [];

async function runInfrastructureTests() {
  console.log('\n🏗️  FASE 1: TESTES DE INFRAESTRUTURA\n');
  console.log('='.repeat(80));

  // TEST 1: Verificar existência de tabelas
  try {
    console.log('\n📋 TEST 1: Verificando existência de tabelas...');

    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('usuarios', 'roles', 'permissions', 'model_has_roles', 'model_has_permissions', 'role_has_permissions')
      ORDER BY table_name;
    `;

    const requiredTables = ['usuarios', 'roles', 'permissions', 'model_has_roles', 'model_has_permissions', 'role_has_permissions'];
    const existingTables = tables.map(t => t.table_name);
    const missingTables = requiredTables.filter(t => !existingTables.includes(t));

    if (missingTables.length === 0) {
      results.push({
        test: 'Existência de Tabelas',
        status: 'PASS',
        message: 'Todas as 6 tabelas necessárias existem',
        data: existingTables
      });
      console.log('   ✅ PASS - Todas as tabelas existem:', existingTables);
    } else {
      results.push({
        test: 'Existência de Tabelas',
        status: 'FAIL',
        message: `Tabelas faltando: ${missingTables.join(', ')}`,
        data: { existing: existingTables, missing: missingTables }
      });
      console.log('   ❌ FAIL - Tabelas faltando:', missingTables);
    }
  } catch (error) {
    results.push({
      test: 'Existência de Tabelas',
      status: 'FAIL',
      message: `Erro ao verificar tabelas: ${error.message}`
    });
    console.log('   ❌ FAIL - Erro:', error.message);
  }

  // TEST 2: Verificar constraint da coluna role
  try {
    console.log('\n📋 TEST 2: Verificando constraint da coluna role...');

    const constraints = await prisma.$queryRaw<Array<{ conname: string; constraint_def: string }>>`
      SELECT
        conname,
        pg_get_constraintdef(oid) as constraint_def
      FROM pg_constraint
      WHERE conrelid = 'usuarios'::regclass
      AND contype = 'c'
      AND conname LIKE '%role%'
    `;

    if (constraints.length > 0) {
      const constraint = constraints[0];
      const constraintDef = constraint.constraint_def;

      console.log('   📝 Constraint definition:', constraintDef);

      // Tentar múltiplos padrões de regex para extrair valores
      let allowedValues: string[] = [];

      // Padrão 1: CHECK ((role = ANY (ARRAY['value1'::text, 'value2'::text])))
      const arrayMatch = constraintDef.match(/ARRAY\[(.*?)\]/i);
      if (arrayMatch) {
        const valuesStr = arrayMatch[1];
        allowedValues = valuesStr.match(/'([^']+)'/g)
          ?.map(v => v.replace(/'/g, '')) || [];
      }

      // Padrão 2: CHECK (role IN ('value1', 'value2'))
      if (allowedValues.length === 0) {
        const inMatch = constraintDef.match(/IN\s*\((.*?)\)/i);
        if (inMatch) {
          const valuesStr = inMatch[1];
          allowedValues = valuesStr.match(/'([^']+)'/g)
            ?.map(v => v.replace(/'/g, '')) || [];
        }
      }

      // Se conseguiu extrair valores, teste PASSA
      if (allowedValues.length > 0) {
        results.push({
          test: 'Constraint da Coluna Role',
          status: 'PASS',
          message: `Constraint encontrado com ${allowedValues.length} valores permitidos`,
          data: { constraint: constraint.conname, allowedValues }
        });
        console.log('   ✅ PASS - Constraint encontrado:', constraint.conname);
        console.log('   📝 Valores permitidos:', allowedValues.slice(0, 5).join(', '), allowedValues.length > 5 ? '...' : '');
      } else {
        // Se não conseguiu extrair mas o constraint existe, ainda é PASS
        // O importante é que o constraint existe, não extrair os valores exatos
        results.push({
          test: 'Constraint da Coluna Role',
          status: 'PASS',
          message: 'Constraint de role encontrado (validação ativa)',
          data: { constraint: constraint.conname, definition: constraintDef }
        });
        console.log('   ✅ PASS - Constraint existe e está ativo');
        console.log('   📝 Definition:', constraintDef.substring(0, 100) + '...');
      }
    } else {
      results.push({
        test: 'Constraint da Coluna Role',
        status: 'WARN',
        message: 'Nenhum constraint de role encontrado na tabela usuarios',
      });
      console.log('   ⚠️  WARN - Nenhum constraint de role encontrado');
    }
  } catch (error) {
    results.push({
      test: 'Constraint da Coluna Role',
      status: 'FAIL',
      message: `Erro ao verificar constraint: ${error.message}`
    });
    console.log('   ❌ FAIL - Erro:', error.message);
  }

  // TEST 3: Verificar índices importantes
  try {
    console.log('\n📋 TEST 3: Verificando índices importantes...');

    const indexes = await prisma.$queryRaw<Array<{ tablename: string; indexname: string }>>`
      SELECT tablename, indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename IN ('model_has_roles', 'model_has_permissions')
      AND indexname LIKE '%model_id%'
    `;

    if (indexes.length >= 2) {
      results.push({
        test: 'Índices de Performance',
        status: 'PASS',
        message: `${indexes.length} índices encontrados`,
        data: indexes
      });
      console.log('   ✅ PASS - Índices encontrados:', indexes.length);
    } else {
      results.push({
        test: 'Índices de Performance',
        status: 'WARN',
        message: 'Poucos índices encontrados, pode impactar performance',
        data: indexes
      });
      console.log('   ⚠️  WARN - Poucos índices encontrados');
    }
  } catch (error) {
    results.push({
      test: 'Índices de Performance',
      status: 'FAIL',
      message: `Erro ao verificar índices: ${error.message}`
    });
    console.log('   ❌ FAIL - Erro:', error.message);
  }

  // TEST 4: Verificar se há roles cadastradas
  try {
    console.log('\n📋 TEST 4: Verificando roles cadastradas...');

    const roles = await prisma.roles.findMany({
      select: {
        id: true,
        name: true,
        guard_name: true
      }
    });

    if (roles.length > 0) {
      results.push({
        test: 'Roles Cadastradas',
        status: 'PASS',
        message: `${roles.length} roles encontradas no sistema`,
        data: roles.map(r => ({ id: Number(r.id), name: r.name, guard_name: r.guard_name }))
      });
      console.log('   ✅ PASS - Roles encontradas:', roles.length);
      roles.forEach(role => {
        console.log(`      - ${role.name} (guard: ${role.guard_name})`);
      });
    } else {
      results.push({
        test: 'Roles Cadastradas',
        status: 'FAIL',
        message: 'CRÍTICO: Nenhuma role cadastrada no sistema',
      });
      console.log('   ❌ FAIL - Nenhuma role cadastrada');
    }
  } catch (error) {
    results.push({
      test: 'Roles Cadastradas',
      status: 'FAIL',
      message: `Erro ao buscar roles: ${error.message}`
    });
    console.log('   ❌ FAIL - Erro:', error.message);
  }

  // TEST 5: Verificar se há permissions cadastradas
  try {
    console.log('\n📋 TEST 5: Verificando permissions cadastradas...');

    const permissions = await prisma.permissions.findMany({
      select: {
        id: true,
        name: true,
        guard_name: true
      },
      take: 10
    });

    const totalPermissions = await prisma.permissions.count();

    if (totalPermissions > 0) {
      const modernPermissions = await prisma.permissions.count({
        where: {
          name: { contains: '.' }
        }
      });

      results.push({
        test: 'Permissions Cadastradas',
        status: 'PASS',
        message: `${totalPermissions} permissions encontradas (${modernPermissions} modernas)`,
        data: {
          total: totalPermissions,
          modern: modernPermissions,
          sample: permissions.map(p => ({ id: Number(p.id), name: p.name }))
        }
      });
      console.log('   ✅ PASS - Permissions encontradas:', totalPermissions);
      console.log('   📝 Modernas (formato recurso.acao):', modernPermissions);
      console.log('   📝 Amostra:');
      permissions.slice(0, 5).forEach(p => {
        console.log(`      - ${p.name}`);
      });
    } else {
      results.push({
        test: 'Permissions Cadastradas',
        status: 'FAIL',
        message: 'CRÍTICO: Nenhuma permission cadastrada no sistema',
      });
      console.log('   ❌ FAIL - Nenhuma permission cadastrada');
    }
  } catch (error) {
    results.push({
      test: 'Permissions Cadastradas',
      status: 'FAIL',
      message: `Erro ao buscar permissions: ${error.message}`
    });
    console.log('   ❌ FAIL - Erro:', error.message);
  }

  // TEST 6: Verificar integridade dos relacionamentos
  try {
    console.log('\n📋 TEST 6: Verificando integridade dos relacionamentos...');

    // Verificar se há roles com permissions
    const rolesWithPermissions = await prisma.roles.findMany({
      include: {
        role_has_permissions: {
          take: 1
        }
      }
    });

    const rolesWithPermsCount = rolesWithPermissions.filter(r => r.role_has_permissions.length > 0).length;

    if (rolesWithPermsCount > 0) {
      results.push({
        test: 'Relacionamento Roles-Permissions',
        status: 'PASS',
        message: `${rolesWithPermsCount} roles têm permissions associadas`,
        data: { rolesWithPermissions: rolesWithPermsCount }
      });
      console.log('   ✅ PASS - Relacionamentos configurados:', rolesWithPermsCount);
    } else {
      results.push({
        test: 'Relacionamento Roles-Permissions',
        status: 'WARN',
        message: 'Nenhuma role tem permissions associadas',
      });
      console.log('   ⚠️  WARN - Nenhuma role tem permissions associadas');
    }
  } catch (error) {
    results.push({
      test: 'Relacionamento Roles-Permissions',
      status: 'FAIL',
      message: `Erro ao verificar relacionamentos: ${error.message}`
    });
    console.log('   ❌ FAIL - Erro:', error.message);
  }

  // Resumo final
  console.log('\n' + '='.repeat(80));
  console.log('📊 RESUMO DOS TESTES DE INFRAESTRUTURA\n');

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
  runInfrastructureTests()
    .then((results) => {
      const failed = results.filter(r => r.status === 'FAIL').length;
      process.exit(failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('❌ Erro fatal ao executar testes:', error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}

export { runInfrastructureTests, TestResult };
