/**
 * DEBUG: reproduz as queries do DashboardService para um usuario especifico,
 * permitindo conferir se o filtro por planta esta correto.
 *
 * Uso: npx ts-node prisma/seeds/debug-dashboard-scope.ts <email>
 */

import { PrismaClient } from '@aupus/api-shared';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] || 'pjlinardelli@hotmail.com';
  console.log('='.repeat(70));
  console.log(`DEBUG DASHBOARD SCOPE para: ${email}`);
  console.log('='.repeat(70));

  const user = await prisma.usuarios.findFirst({ where: { email } });
  if (!user) {
    console.log(`Usuario nao encontrado.`);
    return;
  }
  console.log(`\nUsuario: id="${user.id}" (len=${user.id.length})`);

  const mhr = await prisma.model_has_roles.findFirst({
    where: { model_id: user.id, model_type: 'App\\Models\\User' },
    include: { roles: true },
  });
  console.log(`Role (spatie): ${mhr?.roles?.name ?? 'NENHUMA'} [guard=${mhr?.roles?.guard_name}]`);
  console.log(`Role (legacy coluna usuarios.role): ${user.role}`);

  // Plantas que o proprietario possui
  const plantasDoProp = await prisma.plantas.findMany({
    where: { proprietario_id: user.id, deleted_at: null },
    select: { id: true, nome: true, proprietario_id: true },
  });
  console.log(`\nPlantas onde proprietario_id = user.id: ${plantasDoProp.length}`);
  plantasDoProp.forEach((p) => {
    console.log(`  - "${p.id}" (len=${p.id.length}) ${p.nome}`);
  });

  // Plantas vinculadas como operador
  const vinculosOp = await prisma.planta_operadores.findMany({
    where: { usuario_id: user.id },
    include: { planta: { select: { id: true, nome: true } } },
  });
  console.log(`\nPlantas vinculadas via planta_operadores: ${vinculosOp.length}`);
  vinculosOp.forEach((v) => {
    console.log(`  - "${v.planta.id}" (len=${v.planta.id.length}) ${v.planta.nome}`);
  });

  // Montar escopo (igual ao PermissionScopeService)
  const scope = plantasDoProp.map((p) => p.id.trim());
  console.log(`\nScope computado (trimmed, ${scope.length} plantas): ${JSON.stringify(scope)}`);

  if (scope.length === 0) {
    console.log(`\nEscopo vazio - nao ha dados para conferir.`);
    return;
  }

  // Queries do dashboard.getOverview
  console.log(`\n${'-'.repeat(70)}`);
  console.log(`DASHBOARD /overview:`);
  console.log(`${'-'.repeat(70)}`);

  const eqFilter = { unidade: { planta_id: { in: scope } } };
  const osFilter = { planta_id: { in: scope } };

  const totalEq = await prisma.equipamentos.count({
    where: { deleted_at: null, ...eqFilter },
  });
  console.log(`  total_equipamentos:          ${totalEq}`);

  const eqComFalhas = await prisma.equipamentos.count({
    where: {
      deleted_at: null,
      ...eqFilter,
      anomalias: { some: { deleted_at: null, status: { in: ['REGISTRADA', 'PROGRAMADA'] } } },
    },
  });
  console.log(`  equipamentos_com_falhas:     ${eqComFalhas}`);

  const eqParados = await prisma.equipamentos.count({
    where: { deleted_at: null, status: 'PARADO', ...eqFilter },
  });
  console.log(`  equipamentos_parados:        ${eqParados}`);

  const osAbertas = await prisma.ordens_servico.count({
    where: { deletado_em: null, status: 'PENDENTE', ...osFilter },
  });
  console.log(`  os_abertas (PENDENTE):       ${osAbertas}`);

  const osEmExec = await prisma.ordens_servico.count({
    where: { deletado_em: null, status: 'EM_EXECUCAO', ...osFilter },
  });
  console.log(`  os_em_execucao:              ${osEmExec}`);

  const osFin = await prisma.ordens_servico.count({
    where: { deletado_em: null, status: 'FINALIZADA', ...osFilter },
  });
  console.log(`  os_finalizadas:              ${osFin}`);

  // Severity distribution (anomalias ativas)
  console.log(`\n${'-'.repeat(70)}`);
  console.log(`DASHBOARD /severity-distribution (anomalias ativas):`);
  console.log(`${'-'.repeat(70)}`);
  const anomFilter = {
    OR: [
      { planta_id: { in: scope } },
      { equipamento: { unidade: { planta_id: { in: scope } } } },
    ],
  };
  const totalAnom = await prisma.anomalias.count({
    where: {
      deleted_at: null,
      status: { in: ['REGISTRADA', 'PROGRAMADA'] },
      ...anomFilter,
    },
  });
  console.log(`  total_anomalias:             ${totalAnom}`);

  // Sem escopo (admin): comparacao
  const totalAnomGlobal = await prisma.anomalias.count({
    where: { deleted_at: null, status: { in: ['REGISTRADA', 'PROGRAMADA'] } },
  });
  console.log(`  (referencia sem escopo):     ${totalAnomGlobal}`);

  // Listar as anomalias que ele ve para conferir
  console.log(`\nAnomalias ativas DENTRO do escopo (primeiras 10):`);
  const anomList = await prisma.anomalias.findMany({
    where: {
      deleted_at: null,
      status: { in: ['REGISTRADA', 'PROGRAMADA'] },
      ...anomFilter,
    },
    select: {
      id: true,
      descricao: true,
      planta_id: true,
      equipamento: { select: { unidade: { select: { planta_id: true } } } },
    },
    take: 10,
  });
  anomList.forEach((a) => {
    const plantaViaEq = a.equipamento?.unidade?.planta_id;
    console.log(
      `  "${a.id}" planta_direct="${a.planta_id}" viaEquip="${plantaViaEq}" desc="${a.descricao?.substring(0, 40)}"`,
    );
  });

  // Anomalias ATIVAS (total, incluindo as de fora do escopo) para ver se algo "escapou"
  console.log(`\nSe aparecer alguma anomalia com ambos os planta_ids FORA do scope, houve vazamento de filtro.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
