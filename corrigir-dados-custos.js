// corrigir-dados-custos.js
// Script para corrigir dados necessários para cálculo de custos

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function corrigirDados() {
  console.log('\n🔧 CORRIGINDO DADOS PARA CÁLCULO DE CUSTOS\n');
  console.log('='.repeat(80));

  try {
    // 1. Atualizar concessionária existente com tarifas do Grupo B
    console.log('\n⚡ ATUALIZANDO CONCESSIONÁRIA EQUATORIAL...');
    const concessionariaExistente = await prisma.concessionarias_energia.findFirst({
      where: { nome: { contains: 'Equatorial' } },
    });

    if (concessionariaExistente) {
      await prisma.concessionarias_energia.update({
        where: { id: concessionariaExistente.id },
        data: {
          // Tarifas Grupo B (valores exemplo - você pode ajustar)
          b_tusd_valor: 0.45,  // R$ 0,45/kWh
          b_te_valor: 0.35,    // R$ 0,35/kWh

          // Garantir que tarifas A4 Verde estão completas
          a4_verde_tusd_d: 15.50,   // R$ 15,50/kW (demanda)
          a4_verde_te_d: 0.10,      // R$ 0,10/kW (demanda)
          a4_verde_tusd_p: 0.90,    // Já existe
          a4_verde_te_p: 0.70,      // Já existe
          a4_verde_tusd_fp: 0.30,   // Já existe
          a4_verde_te_fp: 0.40,     // Já existe

          // Tarifas A3a Verde (valores exemplo)
          a3a_verde_tusd_d: 18.50,
          a3a_verde_te_d: 0.12,
          a3a_verde_tusd_p: 1.10,
          a3a_verde_te_p: 0.85,
          a3a_verde_tusd_fp: 0.40,
          a3a_verde_te_fp: 0.50,
        },
      });
      console.log(`✅ Concessionária ${concessionariaExistente.nome} atualizada com todas as tarifas`);
    }

    // 2. Buscar ID da concessionária para usar como padrão
    const concessionaria = await prisma.concessionarias_energia.findFirst();

    if (!concessionaria) {
      console.log('❌ ERRO: Nenhuma concessionária encontrada. Crie uma concessionária primeiro!');
      return;
    }

    console.log(`\n📋 Usando concessionária: ${concessionaria.nome} (${concessionaria.id})`);

    // 3. Atualizar unidades sem grupo/subgrupo/concessionária
    console.log('\n🏢 ATUALIZANDO UNIDADES...\n');

    // Buscar unidades que precisam de atualização
    const unidadesSemDados = await prisma.unidades.findMany({
      where: {
        OR: [
          { grupo: null },
          { subgrupo: null },
          { concessionaria_id: null },
        ],
      },
      select: {
        id: true,
        nome: true,
        grupo: true,
        subgrupo: true,
        concessionaria_id: true,
      },
    });

    console.log(`Encontradas ${unidadesSemDados.length} unidades para atualizar\n`);

    let contador = 0;
    for (const unidade of unidadesSemDados) {
      // Determinar grupo e subgrupo baseado no nome ou tipo
      // Você pode ajustar essa lógica conforme necessário
      let grupo = unidade.grupo;
      let subgrupo = unidade.subgrupo;

      // Se não tem grupo, definir como B (residencial/pequeno porte) por padrão
      if (!grupo) {
        // Se o nome contém "Industrial" ou "PCH", usar Grupo A
        if (unidade.nome.match(/industrial|pch|alta tensão/i)) {
          grupo = 'A';
          subgrupo = subgrupo || 'A4_VERDE';  // Padrão A4 Verde
        } else {
          grupo = 'B';
          subgrupo = 'B';
        }
      }

      // Se tem grupo A mas não tem subgrupo, definir padrão
      if (grupo === 'A' && !subgrupo) {
        subgrupo = 'A4_VERDE';  // Padrão para Grupo A
      }

      // Se tem grupo B, garantir subgrupo B
      if (grupo === 'B') {
        subgrupo = 'B';
      }

      // Atualizar unidade
      await prisma.unidades.update({
        where: { id: unidade.id },
        data: {
          grupo,
          subgrupo,
          concessionaria_id: unidade.concessionaria_id || concessionaria.id,
          // Adicionar demanda padrão para Grupo A (se não tiver)
          demanda_carga: grupo === 'A' && !unidade.demanda_carga ? 100 : undefined,
        },
      });

      contador++;
      console.log(`${contador}. ✅ ${unidade.nome}`);
      console.log(`   Grupo: ${grupo} | Subgrupo: ${subgrupo} | Concessionária: ${concessionaria.nome}`);
    }

    // 4. Verificação final
    console.log('\n📊 VERIFICAÇÃO FINAL:');
    console.log('='.repeat(80));

    const totalUnidades = await prisma.unidades.count();
    const unidadesComGrupo = await prisma.unidades.count({
      where: { grupo: { not: null } },
    });
    const unidadesComSubgrupo = await prisma.unidades.count({
      where: { subgrupo: { not: null } },
    });
    const unidadesComConcessionaria = await prisma.unidades.count({
      where: { concessionaria_id: { not: null } },
    });

    console.log(`Total de Unidades: ${totalUnidades}`);
    console.log(`  ✅ Com grupo definido: ${unidadesComGrupo}/${totalUnidades}`);
    console.log(`  ✅ Com subgrupo definido: ${unidadesComSubgrupo}/${totalUnidades}`);
    console.log(`  ✅ Com concessionária: ${unidadesComConcessionaria}/${totalUnidades}`);

    if (unidadesComGrupo === totalUnidades &&
        unidadesComSubgrupo === totalUnidades &&
        unidadesComConcessionaria === totalUnidades) {
      console.log('\n✅ TODAS AS UNIDADES ESTÃO CONFIGURADAS CORRETAMENTE!');
      console.log('\n🎉 Agora o cálculo de custos deve funcionar para todos os equipamentos!');
    } else {
      console.log('\n⚠️  Ainda há unidades com dados faltantes');
    }

    console.log('\n✅ CORREÇÃO CONCLUÍDA\n');

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

corrigirDados();
