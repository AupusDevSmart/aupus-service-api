/**
 * SEED: Permissoes e Roles (Aupus Service)
 *
 * ATENCAO: este seed e DESTRUTIVO para permissoes:
 * - Limpa role_has_permissions
 * - Limpa model_has_permissions (permissoes diretas de usuarios)
 * - Limpa permissions
 * - Recria permissions conforme permissions-structure.ts
 * - Garante que as 6 roles existam (sem recriar)
 * - Re-mapeia role_has_permissions conforme ROLE_PERMISSIONS
 *
 * As roles NAO sao deletadas para preservar os ids referenciados em model_has_roles.
 */

import { PrismaClient } from '@aupus/api-shared';
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES } from './permissions-structure';

const prisma = new PrismaClient();

async function resetPermissions() {
  console.log('Limpando role_has_permissions...');
  await prisma.role_has_permissions.deleteMany({});

  console.log('Limpando model_has_permissions (permissoes diretas)...');
  await prisma.model_has_permissions.deleteMany({});

  console.log('Limpando permissions...');
  await prisma.permissions.deleteMany({});
}

async function createPermissions() {
  console.log(`Criando ${PERMISSIONS.length} permissoes...`);
  const now = new Date();

  for (const p of PERMISSIONS) {
    await prisma.permissions.create({
      data: {
        name: p.name,
        guard_name: 'web',
        display_name: p.display_name,
        description: p.description,
        created_at: now,
        updated_at: now,
      },
    });
    console.log(`  + ${p.name}`);
  }
}

async function ensureRoles() {
  console.log('Garantindo que as 6 roles existam (qualquer guard)...');
  const now = new Date();

  for (const roleName of ROLES) {
    // Procura por nome, independente do guard (o DB pode ter variantes 'api' legacy)
    const existing = await prisma.roles.findFirst({ where: { name: roleName } });

    if (!existing) {
      await prisma.roles.create({
        data: {
          name: roleName,
          guard_name: 'web',
          created_at: now,
          updated_at: now,
        },
      });
      console.log(`  + criada role ${roleName} (guard=web)`);
    } else {
      console.log(`  = role ${roleName} ja existe (guard=${existing.guard_name})`);
    }
  }
}

async function mapRolePermissions() {
  console.log('Mapeando role_has_permissions (todos os guards)...');

  const allPermissions = await prisma.permissions.findMany();
  const permByName = new Map(allPermissions.map((p) => [p.name, p.id]));

  for (const [roleName, permNames] of Object.entries(ROLE_PERMISSIONS)) {
    // Mapear permissoes para TODAS as roles com esse nome, independente do guard_name.
    // O DB tem versoes legacy com guard='api' alem das novas com guard='web'.
    const rolesWithName = await prisma.roles.findMany({ where: { name: roleName } });

    if (rolesWithName.length === 0) {
      console.warn(`  ! nenhuma role encontrada com nome "${roleName}", pulando`);
      continue;
    }

    for (const role of rolesWithName) {
      for (const permName of permNames) {
        const permId = permByName.get(permName);
        if (!permId) {
          console.warn(`  ! permissao ${permName} nao encontrada, pulando`);
          continue;
        }
        await prisma.role_has_permissions.create({
          data: { role_id: role.id, permission_id: permId },
        });
      }
      console.log(`  ${roleName}[${role.guard_name}#${role.id}]: ${permNames.length} permissoes`);
    }
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('SEED: Permissoes e Roles (Aupus Service)');
  console.log('='.repeat(60));

  try {
    await resetPermissions();
    await createPermissions();
    await ensureRoles();
    await mapRolePermissions();

    console.log('\nSeed de permissoes concluido.');
  } catch (error) {
    console.error('\nErro durante o seed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
