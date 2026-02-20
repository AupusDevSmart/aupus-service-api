// verificar-dados-custos.js
// Script para verificar se os dados necessários para cálculo de custos existem

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verificarDados() {
  console.log('\n🔍 VERIFICANDO DADOS PARA CÁLCULO DE CUSTOS\n');
  console.log('='.repeat(80));

  try {
    // 1. Verificar equipamentos
    const equipamentos = await prisma.equipamentos.findMany({
      select: {
        id: true,
        nome: true,
        unidade_id: true,
      },
      take: 5,
    });

    console.log('\n📦 EQUIPAMENTOS (primeiros 5):');
    console.log('-'.repeat(80));
    if (equipamentos.length === 0) {
      console.log('❌ NENHUM EQUIPAMENTO ENCONTRADO!');
    } else {
      equipamentos.forEach((eq, i) => {
        console.log(`${i + 1}. ${eq.nome}`);
        console.log(`   ID: ${eq.id}`);
        console.log(`   Unidade ID: ${eq.unidade_id || '❌ NÃO DEFINIDO'}`);
      });
    }

    // 2. Verificar unidades
    const unidades = await prisma.unidades.findMany({
      select: {
        id: true,
        nome: true,
        grupo: true,
        subgrupo: true,
        irrigante: true,
        demanda_carga: true,
        concessionaria_id: true,
      },
      take: 10,
    });

    console.log('\n🏢 UNIDADES (primeiras 10):');
    console.log('-'.repeat(80));
    if (unidades.length === 0) {
      console.log('❌ NENHUMA UNIDADE ENCONTRADA!');
    } else {
      unidades.forEach((un, i) => {
        console.log(`${i + 1}. ${un.nome}`);
        console.log(`   ID: ${un.id}`);
        console.log(`   Grupo: ${un.grupo || '❌ NÃO DEFINIDO'}`);
        console.log(`   Subgrupo: ${un.subgrupo || '❌ NÃO DEFINIDO'}`);
        console.log(`   Irrigante: ${un.irrigante ? 'SIM' : 'NÃO'}`);
        console.log(`   Demanda Carga: ${un.demanda_carga || '❌ NÃO DEFINIDO'} kW`);
        console.log(`   Concessionária ID: ${un.concessionaria_id || '❌ NÃO DEFINIDO'}`);
        console.log('');
      });
    }

    // 3. Verificar concessionárias
    const concessionarias = await prisma.concessionarias_energia.findMany({
      select: {
        id: true,
        nome: true,
        estado: true,
        a4_verde_tusd_p: true,
        a4_verde_te_p: true,
        a4_verde_tusd_fp: true,
        a4_verde_te_fp: true,
        b_tusd_valor: true,
        b_te_valor: true,
      },
      take: 5,
    });

    console.log('\n⚡ CONCESSIONÁRIAS (primeiras 5):');
    console.log('-'.repeat(80));
    if (concessionarias.length === 0) {
      console.log('❌ NENHUMA CONCESSIONÁRIA ENCONTRADA!');
    } else {
      concessionarias.forEach((conc, i) => {
        console.log(`${i + 1}. ${conc.nome} (${conc.estado})`);
        console.log(`   ID: ${conc.id}`);
        console.log(`   A4 Verde - TUSD P: ${conc.a4_verde_tusd_p || '❌ NÃO DEFINIDO'}`);
        console.log(`   A4 Verde - TE P: ${conc.a4_verde_te_p || '❌ NÃO DEFINIDO'}`);
        console.log(`   A4 Verde - TUSD FP: ${conc.a4_verde_tusd_fp || '❌ NÃO DEFINIDO'}`);
        console.log(`   A4 Verde - TE FP: ${conc.a4_verde_te_fp || '❌ NÃO DEFINIDO'}`);
        console.log(`   Grupo B - TUSD: ${conc.b_tusd_valor || '❌ NÃO DEFINIDO'}`);
        console.log(`   Grupo B - TE: ${conc.b_te_valor || '❌ NÃO DEFINIDO'}`);
        console.log('');
      });
    }

    // 4. Verificar equipamentos COM unidade COM concessionária
    console.log('\n🔗 VERIFICANDO RELACIONAMENTOS:');
    console.log('-'.repeat(80));

    const equipamentosComUnidade = await prisma.equipamentos.findMany({
      where: {
        unidade_id: { not: null },
      },
      include: {
        unidade: {
          include: {
            concessionaria: true,
          },
        },
      },
      take: 3,
    });

    if (equipamentosComUnidade.length === 0) {
      console.log('❌ NENHUM EQUIPAMENTO COM UNIDADE ENCONTRADO!');
    } else {
      console.log(`✅ ${equipamentosComUnidade.length} equipamentos com unidade encontrados`);

      equipamentosComUnidade.forEach((eq, i) => {
        console.log(`\n${i + 1}. Equipamento: ${eq.nome}`);
        if (eq.unidade) {
          console.log(`   ✅ Unidade: ${eq.unidade.nome}`);
          console.log(`      Grupo: ${eq.unidade.grupo || '❌ NÃO DEFINIDO'}`);
          console.log(`      Subgrupo: ${eq.unidade.subgrupo || '❌ NÃO DEFINIDO'}`);

          if (eq.unidade.concessionaria) {
            console.log(`   ✅ Concessionária: ${eq.unidade.concessionaria.nome}`);
          } else {
            console.log(`   ❌ SEM CONCESSIONÁRIA`);
          }
        } else {
          console.log(`   ❌ SEM UNIDADE`);
        }
      });
    }

    // 5. Resumo
    console.log('\n📊 RESUMO:');
    console.log('='.repeat(80));

    const totalEquipamentos = await prisma.equipamentos.count();
    const totalUnidades = await prisma.unidades.count();
    const totalConcessionarias = await prisma.concessionarias_energia.count();

    const unidadesComGrupo = await prisma.unidades.count({
      where: { grupo: { not: null } },
    });

    const unidadesComSubgrupo = await prisma.unidades.count({
      where: { subgrupo: { not: null } },
    });

    const unidadesComConcessionaria = await prisma.unidades.count({
      where: { concessionaria_id: { not: null } },
    });

    console.log(`Total de Equipamentos: ${totalEquipamentos}`);
    console.log(`Total de Unidades: ${totalUnidades}`);
    console.log(`  - Com grupo definido: ${unidadesComGrupo}/${totalUnidades}`);
    console.log(`  - Com subgrupo definido: ${unidadesComSubgrupo}/${totalUnidades}`);
    console.log(`  - Com concessionária: ${unidadesComConcessionaria}/${totalUnidades}`);
    console.log(`Total de Concessionárias: ${totalConcessionarias}`);

    console.log('\n⚠️  PROBLEMAS IDENTIFICADOS:');
    console.log('-'.repeat(80));

    if (totalUnidades === 0) {
      console.log('❌ CRÍTICO: Nenhuma unidade cadastrada!');
    }

    if (unidadesComGrupo < totalUnidades) {
      console.log(`⚠️  ${totalUnidades - unidadesComGrupo} unidades sem GRUPO definido`);
    }

    if (unidadesComSubgrupo < totalUnidades) {
      console.log(`⚠️  ${totalUnidades - unidadesComSubgrupo} unidades sem SUBGRUPO definido`);
    }

    if (unidadesComConcessionaria < totalUnidades) {
      console.log(`⚠️  ${totalUnidades - unidadesComConcessionaria} unidades sem CONCESSIONÁRIA`);
    }

    if (totalConcessionarias === 0) {
      console.log('❌ CRÍTICO: Nenhuma concessionária cadastrada!');
    }

    console.log('\n✅ VERIFICAÇÃO CONCLUÍDA\n');

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

verificarDados();
