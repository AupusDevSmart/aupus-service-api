/**
 * SYNC RBAC: deixa o banco igual à matriz (src/core/modules/permissions/matriz-de-permissoes.ts).
 *
 * Seed de RBAC é irreversível pelo contrato (docs/CONTRATO-JIRA-CLAUDE.md §6):
 * rodar primeiro em PRÉVIA, mostrar o diff, e só aplicar com confirmação.
 *
 * O que faz:
 * - cria as permissões que faltam e atualiza nome exibido/descrição;
 *   NUNCA apaga linha de `permissions` (só desvincula dos papéis)
 * - cria os papéis que faltam
 * - para cada papel da matriz, em todos os guards: acrescenta o que falta e
 *   TIRA o que a matriz não dá (modo exato — a matriz é o estado desejado)
 * - --limpar-diretas: apaga as permissões diretas de usuário que o papel dele
 *   já dá. O formulário antigo gravava todas as permissões do papel como
 *   diretas; com elas, mudar o papel não mudava o acesso.
 * - --fix-guards: corrige guard_name de papel divergente (só DEV)
 *
 * Uso:
 *   npx ts-node -r tsconfig-paths/register scripts/db/sync-rbac.ts                       # prévia
 *   npx ts-node -r tsconfig-paths/register scripts/db/sync-rbac.ts --limpar-diretas      # prévia com a limpeza
 *   npx ts-node -r tsconfig-paths/register scripts/db/sync-rbac.ts --apply --limpar-diretas
 */

import { PrismaClient } from '@prisma/client';
import { PAPEIS, PERMISSOES } from '../../src/core/modules/permissions/matriz-de-permissoes';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const LIMPAR_DIRETAS = process.argv.includes('--limpar-diretas');
const FIX_GUARDS = process.argv.includes('--fix-guards');
const TARGET_GUARD = 'api';
const MODEL_TYPE = 'App\\Models\\User';

let acoes = 0;
const log = (msg: string) => {
  acoes++;
  console.log(msg);
};

async function sincronizarPermissoes() {
  const existentes = await prisma.permissions.findMany();
  for (const def of PERMISSOES) {
    const mesmas = existentes.filter((p) => p.name === def.name);
    if (mesmas.length === 0) {
      log(`  + permissao: ${def.name}`);
      if (APPLY) {
        const agora = new Date();
        await prisma.permissions.create({
          data: { name: def.name, guard_name: 'web', display_name: def.display_name, description: def.description, created_at: agora, updated_at: agora },
        });
      }
      continue;
    }
    for (const p of mesmas) {
      if (p.display_name === def.display_name && p.description === def.description) continue;
      log(`  ~ permissao ${def.name}[${p.guard_name}#${p.id}]: nome/descricao`);
      if (APPLY) {
        await prisma.permissions.update({ where: { id: p.id }, data: { display_name: def.display_name, description: def.description } });
      }
    }
  }
}

async function garantirPapeis() {
  for (const papel of PAPEIS) {
    if (await prisma.roles.findFirst({ where: { name: papel.name } })) continue;
    log(`  + papel: ${papel.name} (guard=${TARGET_GUARD})`);
    if (APPLY) {
      const agora = new Date();
      await prisma.roles.create({ data: { name: papel.name, guard_name: TARGET_GUARD, created_at: agora, updated_at: agora } });
    }
  }
}

async function corrigirGuards() {
  const divergentes = await prisma.roles.findMany({ where: { name: { in: PAPEIS.map((p) => p.name) }, NOT: { guard_name: TARGET_GUARD } } });
  for (const r of divergentes) {
    log(`  ~ guard do papel ${r.name}: ${r.guard_name} -> ${TARGET_GUARD}`);
    if (APPLY) await prisma.roles.update({ where: { id: r.id }, data: { guard_name: TARGET_GUARD } });
  }
}

async function sincronizarPapeis() {
  const todas = await prisma.permissions.findMany();
  // Um id por nome para acrescentar (o de menor id); para tirar, vale o nome em qualquer guard.
  const primeiroPorNome = new Map<string, bigint>();
  for (const p of [...todas].sort((a, b) => Number(a.id - b.id))) if (!primeiroPorNome.has(p.name)) primeiroPorNome.set(p.name, p.id);

  for (const papel of PAPEIS) {
    const desejadas = new Set(papel.permissoes);
    for (const role of await prisma.roles.findMany({ where: { name: papel.name } })) {
      const atuais = await prisma.role_has_permissions.findMany({ where: { role_id: role.id }, include: { permissions: true } });
      const nomesAtuais = new Set(atuais.map((v) => v.permissions.name));
      const rotulo = `${papel.name}[${role.guard_name}#${role.id}]`;

      for (const nome of papel.permissoes) {
        if (nomesAtuais.has(nome)) continue;
        const id = primeiroPorNome.get(nome);
        if (!id) {
          log(`  ! ${rotulo}: ${nome} ainda nao existe (aplique a etapa 1)`);
          continue;
        }
        log(`  + ${rotulo} += ${nome}`);
        if (APPLY) await prisma.role_has_permissions.create({ data: { role_id: role.id, permission_id: id } });
      }

      for (const vinculo of atuais) {
        if (desejadas.has(vinculo.permissions.name)) continue;
        log(`  - ${rotulo} -= ${vinculo.permissions.name}`);
        if (APPLY) {
          await prisma.role_has_permissions.delete({
            where: { permission_id_role_id: { permission_id: vinculo.permission_id, role_id: role.id } },
          });
        }
      }
    }
  }
}

async function limparDiretasRedundantes() {
  const doPapel = new Map(PAPEIS.map((p) => [p.name, new Set(p.permissoes)]));
  const vinculos = await prisma.model_has_roles.findMany({ where: { model_type: MODEL_TYPE }, include: { roles: true } });
  const papelDoUsuario = new Map(vinculos.map((v) => [v.model_id.trim(), v.roles.name]));

  const diretas = await prisma.model_has_permissions.findMany({ where: { model_type: MODEL_TYPE }, include: { permissions: true } });
  let mantidas = 0;
  for (const d of diretas) {
    const papel = papelDoUsuario.get(d.model_id.trim());
    if (papel && doPapel.get(papel)?.has(d.permissions.name)) {
      log(`  - direta ${d.model_id.trim()} (${papel}) -= ${d.permissions.name} (o papel ja da)`);
      if (APPLY) {
        await prisma.model_has_permissions.delete({
          where: { permission_id_model_id_model_type: { permission_id: d.permission_id, model_id: d.model_id, model_type: MODEL_TYPE } },
        });
      }
    } else {
      mantidas++;
    }
  }
  console.log(`  = ${mantidas} permissoes diretas ficam (nao vem do papel)`);
}

async function main() {
  console.log('='.repeat(70));
  console.log(`SYNC RBAC ${APPLY ? '[APLICANDO]' : '[PREVIA]'}${LIMPAR_DIRETAS ? ' [+limpar diretas]' : ''}${FIX_GUARDS ? ' [+fix guards]' : ''}`);
  console.log('='.repeat(70));
  try {
    console.log('\n[1] Permissoes');
    await sincronizarPermissoes();
    console.log('\n[2] Papeis');
    await garantirPapeis();
    if (FIX_GUARDS) {
      console.log('\n[2b] Guards');
      await corrigirGuards();
    }
    console.log('\n[3] Permissoes de cada papel (modo exato)');
    await sincronizarPapeis();
    if (LIMPAR_DIRETAS) {
      console.log('\n[4] Permissoes diretas que o papel ja da');
      await limparDiretasRedundantes();
    }
    console.log('\n' + '='.repeat(70));
    console.log(APPLY ? `Concluido: ${acoes} acoes aplicadas.` : `PREVIA: ${acoes} acoes seriam aplicadas. Rode com --apply para aplicar.`);
  } catch (erro) {
    console.error('\nErro:', erro);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
