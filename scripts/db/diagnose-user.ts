/**
 * Diagnostico rapido de um usuario: role, permissions e plantas vinculadas.
 *
 * Uso:
 *   cd aupus-service-api
 *   npx ts-node scripts/db/diagnose-user.ts operario@email.com
 *
 * Mostra:
 *   - dados basicos do usuario (id, status, role legacy column)
 *   - vinculo em model_has_roles + guard do role
 *   - permissions via role_has_permissions (separadas por guard)
 *   - permissions diretas via model_has_permissions
 *   - plantas vinculadas via planta_operadores (com trim/raw)
 *   - plantas que ele eh proprietario_id (via plantas.proprietario_id)
 *
 * Read-only. Nao escreve nada.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Uso: npx ts-node scripts/db/diagnose-user.ts <email-ou-id>');
    process.exit(1);
  }

  console.log(`\n=== Diagnostico de ${arg} ===\n`);

  const isEmail = arg.includes('@');
  const usuario = await prisma.usuarios.findFirst({
    where: isEmail ? { email: arg } : { id: arg.trim() },
    select: {
      id: true,
      email: true,
      nome: true,
      status: true,
      is_active: true,
      role: true, // coluna legacy
      deleted_at: true,
    },
  });

  if (!usuario) {
    console.error(`Usuario nao encontrado por ${isEmail ? 'email' : 'id'}: ${arg}`);
    process.exit(1);
  }

  console.log('1) USUARIO');
  console.log({
    id: `"${usuario.id}" (len=${usuario.id.length})`,
    idTrimmed: usuario.id.trim(),
    email: usuario.email,
    nome: usuario.nome,
    status: usuario.status,
    is_active: usuario.is_active,
    role_legacy_column: usuario.role,
    deleted_at: usuario.deleted_at,
  });

  const userId = usuario.id; // raw, pode ter espacos

  console.log('\n2) MODEL_HAS_ROLES (Spatie)');
  const roles = await prisma.model_has_roles.findMany({
    where: { model_id: userId.trim(), model_type: 'App\\Models\\User' },
    include: { roles: true },
  });
  if (roles.length === 0) {
    console.log('  [!] Nenhum role vinculado via Spatie. O usuario nao recebera nenhuma permission via role.');
  } else {
    roles.forEach((r) => {
      console.log(`  role.id=${r.roles.id} name="${r.roles.name}" guard="${r.roles.guard_name}"`);
    });
  }

  // tentar tambem com model_id raw (sem trim) caso haja espaco
  const rolesRaw = await prisma.$queryRaw<any[]>`
    SELECT mhr.model_id, r.id as role_id, r.name, r.guard_name
    FROM model_has_roles mhr
    JOIN roles r ON r.id = mhr.role_id
    WHERE TRIM(mhr.model_id) = TRIM(${userId})
      AND mhr.model_type = 'App\\Models\\User'
  `;
  if (rolesRaw.length !== roles.length) {
    console.log('  [!] Diferenca entre query Prisma e SQL raw (sugere problema de padding):');
    console.log('      Prisma:', roles.length, 'rows. SQL raw:', rolesRaw.length, 'rows.');
    console.log('      Raw:', rolesRaw);
  }

  console.log('\n3) ROLE_HAS_PERMISSIONS (permissions vinculadas ao role)');
  for (const r of roles) {
    const rhp = await prisma.role_has_permissions.findMany({
      where: { role_id: r.roles.id },
      include: { permissions: true },
    });
    console.log(`  role "${r.roles.name}" (guard=${r.roles.guard_name}): ${rhp.length} permissions`);
    rhp.forEach((p) => {
      console.log(`    - ${p.permissions.name} (guard=${p.permissions.guard_name})`);
    });
  }

  console.log('\n4) MODEL_HAS_PERMISSIONS (diretas)');
  const direct = await prisma.model_has_permissions.findMany({
    where: { model_id: userId.trim(), model_type: 'App\\Models\\User' },
    include: { permissions: true },
  });
  if (direct.length === 0) {
    console.log('  (nenhuma permission direta)');
  } else {
    direct.forEach((p) => {
      console.log(`    - ${p.permissions.name} (guard=${p.permissions.guard_name})`);
    });
  }

  console.log('\n5) PLANTA_OPERADORES (vinculos como operador)');
  const vinculos = await prisma.planta_operadores.findMany({
    where: { usuario_id: userId.trim() },
    include: { planta: { select: { id: true, nome: true, deleted_at: true } } },
  });
  if (vinculos.length === 0) {
    console.log('  (nenhum vinculo via Prisma com usuario_id trimmed)');
  } else {
    vinculos.forEach((v) => {
      console.log(`    - planta_id="${v.planta_id}" (len=${v.planta_id.length}) nome="${v.planta?.nome}" deleted=${v.planta?.deleted_at}`);
    });
  }

  // verificar via SQL raw com TRIM em ambos os lados
  const vinculosRaw = await prisma.$queryRaw<any[]>`
    SELECT po.planta_id, p.nome, p.deleted_at
    FROM planta_operadores po
    LEFT JOIN plantas p ON TRIM(p.id) = TRIM(po.planta_id)
    WHERE TRIM(po.usuario_id) = TRIM(${userId})
  `;
  if (vinculosRaw.length !== vinculos.length) {
    console.log('  [!] Diferenca via SQL raw (padding):');
    console.log(vinculosRaw);
  }

  console.log('\n6) PLANTAS ONDE EH PROPRIETARIO (plantas.proprietario_id)');
  const plantasProprietario = await prisma.plantas.findMany({
    where: { proprietario_id: userId.trim(), deleted_at: null },
    select: { id: true, nome: true },
  });
  if (plantasProprietario.length === 0) {
    console.log('  (nenhuma)');
  } else {
    plantasProprietario.forEach((p) => console.log(`    - ${p.nome} (${p.id.trim()})`));
  }

  console.log('\n=== Resumo ===');
  console.log(`Email: ${usuario.email}`);
  console.log(`Status: ${usuario.status}, is_active: ${usuario.is_active}`);
  console.log(`Role(s) via Spatie: ${roles.map((r) => `${r.roles.name}/${r.roles.guard_name}`).join(', ') || '(NENHUM)'}`);
  console.log(`Role legacy column: ${usuario.role || '(null)'}`);
  console.log(`Plantas vinculadas (operador): ${vinculos.length}`);
  console.log(`Plantas que possui (proprietario_id): ${plantasProprietario.length}`);
  console.log('');
  console.log('Para o scope funcionar como operador, o usuario PRECISA:');
  console.log('  - Ter role "operador" via model_has_roles');
  console.log('  - Ter permissions do operador via role_has_permissions (se nao tem, rodar sync-rbac.ts --apply)');
  console.log('  - Ter pelo menos um vinculo em planta_operadores');
  console.log('  - O role do JWT (payload.role) e resolvido por getUserPermissions -> role.name');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
