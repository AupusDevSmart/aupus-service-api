/**
 * CLEANUP: Remove roles 'web' duplicadas quando existe o mesmo nome com guard 'api'.
 *
 * Estrategia:
 * 1. Para cada role name, se existir 'web' E 'api':
 *    - Migra model_has_roles do web -> api (transfere usuarios)
 *    - Deleta role_has_permissions do web
 *    - Deleta o role web
 * 2. Para roles que so existem como 'web' (ex: analista neste sistema), nao faz nada.
 */

import { PrismaClient } from '@aupus/api-shared';

const prisma = new PrismaClient();

async function cleanup() {
  console.log('='.repeat(60));
  console.log('CLEANUP: roles duplicadas (web + api)');
  console.log('='.repeat(60));

  const allRoles = await prisma.roles.findMany({ orderBy: [{ name: 'asc' }, { guard_name: 'asc' }] });
  const byName = new Map<string, typeof allRoles>();
  for (const r of allRoles) {
    if (!byName.has(r.name)) byName.set(r.name, [] as any);
    byName.get(r.name)!.push(r);
  }

  let transferredUsers = 0;
  let deletedRoles = 0;
  let deletedMappings = 0;

  for (const [name, roles] of byName) {
    if (roles.length < 2) continue;

    const api = roles.find((r) => r.guard_name === 'api');
    const web = roles.find((r) => r.guard_name === 'web');

    if (!api || !web) continue;

    console.log(`\n> ${name}: api#${api.id} (manter) | web#${web.id} (remover)`);

    // 1) Transferir model_has_roles de web -> api (ignorando conflitos)
    const webUsers = await prisma.model_has_roles.findMany({ where: { role_id: web.id } });
    for (const mu of webUsers) {
      // Se o usuario ja tem o role api, so remove o web
      const jaTemApi = await prisma.model_has_roles.findFirst({
        where: { role_id: api.id, model_id: mu.model_id, model_type: mu.model_type },
      });
      if (jaTemApi) {
        await prisma.model_has_roles.deleteMany({
          where: { role_id: web.id, model_id: mu.model_id, model_type: mu.model_type },
        });
        console.log(`  - usuario ${mu.model_id} ja tinha api, web removido`);
      } else {
        await prisma.model_has_roles.updateMany({
          where: { role_id: web.id, model_id: mu.model_id, model_type: mu.model_type },
          data: { role_id: api.id },
        });
        console.log(`  - usuario ${mu.model_id} migrado de web -> api`);
        transferredUsers++;
      }
    }

    // 2) Deletar role_has_permissions do web
    const delPerms = await prisma.role_has_permissions.deleteMany({ where: { role_id: web.id } });
    deletedMappings += delPerms.count;

    // 3) Deletar o role web
    await prisma.roles.delete({ where: { id: web.id } });
    deletedRoles++;
    console.log(`  + role web#${web.id} deletado (${delPerms.count} mappings de permissoes removidos)`);
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`Resumo:`);
  console.log(`  Usuarios migrados: ${transferredUsers}`);
  console.log(`  Roles web deletados: ${deletedRoles}`);
  console.log(`  Mappings role_has_permissions removidos: ${deletedMappings}`);

  // Estado final
  const finalRoles = await prisma.roles.findMany({ orderBy: [{ name: 'asc' }, { guard_name: 'asc' }] });
  console.log('\nEstado final de roles:');
  for (const r of finalRoles) {
    const userCount = await prisma.model_has_roles.count({ where: { role_id: r.id } });
    const permCount = await prisma.role_has_permissions.count({ where: { role_id: r.id } });
    console.log(`  ${r.name.padEnd(15)} [${r.guard_name}] id=${r.id}  usuarios=${userCount}  permissoes=${permCount}`);
  }
}

cleanup()
  .catch((err) => {
    console.error('Erro:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
