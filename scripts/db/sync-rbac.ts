/**
 * SYNC RBAC: Sincronizacao idempotente e conservadora de permissions/roles.
 *
 * Em contraste com seed-permissions.ts (destrutivo - apaga e recria tudo),
 * este script:
 *
 * - NUNCA deleta permissions ja existentes.
 * - Cria permissions faltantes (com base em PERMISSIONS de permissions-structure).
 * - Adiciona role_has_permissions faltantes (com base em ROLE_PERMISSIONS).
 * - NAO remove role_has_permissions extras, exceto as listadas em
 *   ROLE_PERMISSIONS_TO_REMOVE (remocao one-off, requer flag --apply-removals).
 * - Pode corrigir guard_name divergente de roles (flag --fix-guards), util em DEV.
 * - Por padrao roda em modo DRY-RUN: imprime o diff e nao toca em nada.
 *   Use --apply para executar as mudancas.
 *
 * Uso:
 *   npx ts-node scripts/db/sync-rbac.ts                    # dry-run (default)
 *   npx ts-node scripts/db/sync-rbac.ts --apply            # aplica adicoes
 *   npx ts-node scripts/db/sync-rbac.ts --apply --apply-removals  # aplica adicoes + remocoes one-off
 *   npx ts-node scripts/db/sync-rbac.ts --apply --fix-guards      # corrige guard divergente (DEV apenas)
 */

import { PrismaClient } from '@aupus/api-shared';
import { PERMISSIONS, ROLE_PERMISSIONS, ROLE_PERMISSIONS_TO_REMOVE, ROLES } from './permissions-structure';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const APPLY_REMOVALS = process.argv.includes('--apply-removals');
const FIX_GUARDS = process.argv.includes('--fix-guards');
const TARGET_GUARD = 'api';

type ActionLog = string[];

function log(actions: ActionLog, msg: string) {
  actions.push(msg);
  console.log(msg);
}

async function syncPermissions(actions: ActionLog) {
  const existing = await prisma.permissions.findMany();
  const existingByName = new Map(existing.map((p) => [p.name, p]));

  let toCreate = 0;
  for (const def of PERMISSIONS) {
    if (existingByName.has(def.name)) continue;
    toCreate++;
    log(actions, `  + create permission: ${def.name}`);
    if (APPLY) {
      const now = new Date();
      await prisma.permissions.create({
        data: {
          name: def.name,
          guard_name: 'web',
          display_name: def.display_name,
          description: def.description,
          created_at: now,
          updated_at: now,
        },
      });
    }
  }

  if (toCreate === 0) {
    log(actions, '  = nenhuma permission nova a criar');
  }
}

async function ensureRoles(actions: ActionLog) {
  for (const name of ROLES) {
    const existing = await prisma.roles.findFirst({ where: { name } });
    if (!existing) {
      log(actions, `  + create role: ${name} (guard=${TARGET_GUARD})`);
      if (APPLY) {
        const now = new Date();
        await prisma.roles.create({
          data: { name, guard_name: TARGET_GUARD, created_at: now, updated_at: now },
        });
      }
    }
  }
}

async function fixGuards(actions: ActionLog) {
  if (!FIX_GUARDS) return;
  const rolesMismatch = await prisma.roles.findMany({
    where: { name: { in: ROLES }, NOT: { guard_name: TARGET_GUARD } },
  });
  for (const r of rolesMismatch) {
    log(actions, `  ~ fix guard_name: role ${r.name} ${r.guard_name} -> ${TARGET_GUARD}`);
    if (APPLY) {
      await prisma.roles.update({ where: { id: r.id }, data: { guard_name: TARGET_GUARD } });
    }
  }
  if (rolesMismatch.length === 0) {
    log(actions, '  = nenhum guard a corrigir');
  }
}

async function syncRolePermissions(actions: ActionLog) {
  const allPermissions = await prisma.permissions.findMany();
  const permByName = new Map(allPermissions.map((p) => [p.name, p]));

  for (const [roleName, permNames] of Object.entries(ROLE_PERMISSIONS)) {
    const rolesWithName = await prisma.roles.findMany({ where: { name: roleName } });
    if (rolesWithName.length === 0) {
      log(actions, `  ! role "${roleName}" nao encontrada, pulando`);
      continue;
    }

    for (const role of rolesWithName) {
      const current = await prisma.role_has_permissions.findMany({
        where: { role_id: role.id },
        include: { permissions: true },
      });
      const currentNames = new Set(current.map((rhp) => rhp.permissions.name));

      // Adicionar perms novas
      for (const permName of permNames) {
        if (currentNames.has(permName)) continue;
        const perm = permByName.get(permName);
        if (!perm) {
          log(actions, `  ! perm ${permName} nao existe (rode --apply primeiro), pulando vinculo`);
          continue;
        }
        log(actions, `  + role ${roleName}[${role.guard_name}#${role.id}] += ${permName}`);
        if (APPLY) {
          await prisma.role_has_permissions.create({
            data: { role_id: role.id, permission_id: perm.id },
          });
        }
      }
    }
  }
}

async function applyRemovals(actions: ActionLog) {
  if (!APPLY_REMOVALS) {
    const total = Object.values(ROLE_PERMISSIONS_TO_REMOVE).reduce((acc, l) => acc + l.length, 0);
    if (total > 0) {
      log(actions, `  (skip) ${total} remocoes one-off pendentes (use --apply-removals para aplicar)`);
    }
    return;
  }

  const allPermissions = await prisma.permissions.findMany();
  const permByName = new Map(allPermissions.map((p) => [p.name, p]));

  for (const [roleName, permNames] of Object.entries(ROLE_PERMISSIONS_TO_REMOVE)) {
    const rolesWithName = await prisma.roles.findMany({ where: { name: roleName } });
    for (const role of rolesWithName) {
      for (const permName of permNames) {
        const perm = permByName.get(permName);
        if (!perm) continue;
        const link = await prisma.role_has_permissions.findFirst({
          where: { role_id: role.id, permission_id: perm.id },
        });
        if (!link) continue;
        log(actions, `  - role ${roleName}[${role.guard_name}#${role.id}] -= ${permName}`);
        if (APPLY) {
          await prisma.role_has_permissions.delete({
            where: { permission_id_role_id: { permission_id: perm.id, role_id: role.id } },
          });
        }
      }
    }
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log(`SYNC RBAC ${APPLY ? '[APPLY]' : '[DRY-RUN]'}` +
    (APPLY_REMOVALS ? ' [+removals]' : '') +
    (FIX_GUARDS ? ' [+fix-guards]' : ''));
  console.log('='.repeat(70));

  const actions: ActionLog = [];

  try {
    console.log('\n[1] Permissions');
    await syncPermissions(actions);

    console.log('\n[2] Roles');
    await ensureRoles(actions);

    if (FIX_GUARDS) {
      console.log('\n[2b] Fix guards');
      await fixGuards(actions);
    }

    console.log('\n[3] role_has_permissions (adicoes)');
    await syncRolePermissions(actions);

    console.log('\n[4] Remocoes one-off');
    await applyRemovals(actions);

    console.log('\n' + '='.repeat(70));
    if (APPLY) {
      console.log(`Concluido. ${actions.length} acoes aplicadas.`);
    } else {
      console.log(`DRY-RUN concluido. ${actions.length} acoes seriam aplicadas.`);
      console.log('Re-execute com --apply para confirmar.');
    }
  } catch (error) {
    console.error('\nErro:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
