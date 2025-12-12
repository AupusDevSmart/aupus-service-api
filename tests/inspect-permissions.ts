// tests/inspect-permissions.ts
// Script para inspecionar dados de permissions, roles e relacionamentos

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function inspectPermissions() {
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║         INSPEÇÃO DE DADOS - PERMISSIONS E ROLES                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  // 1. Roles
  console.log('📋 1. ROLES CADASTRADAS:\n');
  const roles = await prisma.roles.findMany({
    orderBy: { id: 'asc' }
  });

  console.log(`Total: ${roles.length} roles\n`);
  roles.forEach(role => {
    console.log(`  [${role.id}] ${role.name} (guard: ${role.guard_name})`);
  });

  // 2. Permissions (amostra)
  console.log('\n\n📋 2. PERMISSIONS CADASTRADAS:\n');
  const totalPermissions = await prisma.permissions.count();
  const modernPermissions = await prisma.permissions.count({
    where: { name: { contains: '.' } }
  });
  const legacyPermissions = totalPermissions - modernPermissions;

  console.log(`Total: ${totalPermissions} permissions`);
  console.log(`  - Modernas (formato recurso.acao): ${modernPermissions}`);
  console.log(`  - Legacy (sem ponto): ${legacyPermissions}\n`);

  // Amostra de permissions modernas
  const modernPerms = await prisma.permissions.findMany({
    where: { name: { contains: '.' } },
    take: 15,
    orderBy: { name: 'asc' }
  });

  console.log('Amostra de permissions modernas:');
  modernPerms.forEach(perm => {
    console.log(`  [${perm.id}] ${perm.name} - ${perm.display_name || 'N/A'}`);
  });

  // Amostra de permissions legacy
  const legacyPerms = await prisma.permissions.findMany({
    where: { name: { not: { contains: '.' } } },
    take: 15,
    orderBy: { name: 'asc' }
  });

  console.log('\nAmostra de permissions legacy:');
  legacyPerms.forEach(perm => {
    console.log(`  [${perm.id}] ${perm.name}`);
  });

  // 3. Role has Permissions (para cada role)
  console.log('\n\n📋 3. PERMISSIONS POR ROLE:\n');

  for (const role of roles) {
    const rolePerms = await prisma.role_has_permissions.findMany({
      where: { role_id: role.id },
      include: {
        permissions: true
      }
    });

    console.log(`\n🔹 ${role.name} (${rolePerms.length} permissions):`);
    if (rolePerms.length > 0) {
      // Mostrar primeiras 10
      rolePerms.slice(0, 10).forEach(rp => {
        console.log(`     - ${rp.permissions.name}`);
      });
      if (rolePerms.length > 10) {
        console.log(`     ... e mais ${rolePerms.length - 10}`);
      }
    } else {
      console.log('     (nenhuma permission associada)');
    }
  }

  // 4. Usuários com roles
  console.log('\n\n📋 4. USUÁRIOS COM ROLES:\n');

  const usersWithRoles = await prisma.model_has_roles.findMany({
    include: {
      roles: true
    },
    take: 10
  });

  console.log(`Total de associações: ${usersWithRoles.length} (mostrando até 10)\n`);

  for (const ur of usersWithRoles.slice(0, 10)) {
    // Buscar dados do usuário
    const user = await prisma.usuarios.findUnique({
      where: { id: ur.model_id },
      select: { nome: true, email: true }
    });

    if (user) {
      console.log(`  👤 ${user.nome} (${user.email})`);
      console.log(`     Role: ${ur.roles.name}`);
    }
  }

  // 5. Usuários com permissions diretas
  console.log('\n\n📋 5. USUÁRIOS COM PERMISSIONS DIRETAS:\n');

  const usersWithDirectPerms = await prisma.model_has_permissions.findMany({
    include: {
      permissions: true
    },
    take: 10
  });

  console.log(`Total de associações: ${usersWithDirectPerms.length} (mostrando até 10)\n`);

  if (usersWithDirectPerms.length > 0) {
    for (const up of usersWithDirectPerms.slice(0, 10)) {
      const user = await prisma.usuarios.findUnique({
        where: { id: up.model_id },
        select: { nome: true, email: true }
      });

      if (user) {
        console.log(`  👤 ${user.nome} (${user.email})`);
        console.log(`     Permission direta: ${up.permissions.name}`);
      }
    }
  } else {
    console.log('  (nenhum usuário com permissions diretas)');
  }

  // 6. Categorização de Permissions
  console.log('\n\n📋 6. CATEGORIZAÇÃO DE PERMISSIONS MODERNAS:\n');

  const allModernPerms = await prisma.permissions.findMany({
    where: { name: { contains: '.' } },
    orderBy: { name: 'asc' }
  });

  const categorized: { [key: string]: number } = {};

  allModernPerms.forEach(perm => {
    const [resource] = perm.name.split('.');
    categorized[resource] = (categorized[resource] || 0) + 1;
  });

  const sortedCategories = Object.entries(categorized)
    .sort((a, b) => b[1] - a[1]);

  console.log('Recursos encontrados:\n');
  sortedCategories.forEach(([resource, count]) => {
    console.log(`  📦 ${resource}: ${count} permissions`);
  });

  // 7. Estatísticas Gerais
  console.log('\n\n📊 ESTATÍSTICAS GERAIS:\n');

  const totalUsers = await prisma.usuarios.count();
  const activeUsers = await prisma.usuarios.count({
    where: {
      status: 'Ativo',
      is_active: true,
      deleted_at: null
    }
  });

  const usersWithRolesCount = await prisma.model_has_roles.count();
  const usersWithDirectPermsCount = await prisma.model_has_permissions.count();

  console.log(`  👥 Usuários:`);
  console.log(`     - Total: ${totalUsers}`);
  console.log(`     - Ativos: ${activeUsers}`);
  console.log(`     - Com roles: ${usersWithRolesCount}`);
  console.log(`     - Com permissions diretas: ${usersWithDirectPermsCount}`);
  console.log(``);
  console.log(`  🔐 Roles: ${roles.length}`);
  console.log(`  🔑 Permissions: ${totalPermissions}`);
  console.log(`     - Modernas: ${modernPermissions}`);
  console.log(`     - Legacy: ${legacyPermissions}`);

  console.log('\n═══════════════════════════════════════════════════════════════════\n');
}

// Executar
inspectPermissions()
  .then(() => {
    console.log('✅ Inspeção concluída!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro ao inspecionar:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
