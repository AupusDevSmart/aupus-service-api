import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeOutroPattern() {
  console.log('\n🔍 ANÁLISE DO PADRÃO DE UNIDADES "OUTRO":\n');

  const outroUnits: any[] = await prisma.$queryRaw`
    SELECT
      u.id,
      u.nome,
      u.tipo,
      u.tipo_unidade,
      u.demanda_carga,
      u.demanda_geracao,
      u.irrigante
    FROM unidades u
    WHERE u.tipo = 'OUTRO'
    AND u.deleted_at IS NULL
    ORDER BY u.created_at DESC
  `;

  console.log('📋 PADRÃO IDENTIFICADO:\n');

  // Agrupar por tipo_unidade
  const porTipoUnidade = outroUnits.reduce((acc, unit) => {
    const tipo = unit.tipo_unidade || 'NULL';
    if (!acc[tipo]) acc[tipo] = [];
    acc[tipo].push(unit);
    return acc;
  }, {} as Record<string, typeof outroUnits>);

  Object.entries(porTipoUnidade).forEach(([tipoUnidade, unidades]) => {
    const lista = unidades as any[];
    console.log(`\n📦 tipo_unidade = "${tipoUnidade}" (${lista.length} unidades):`);
    lista.forEach((u: any) => {
      console.log(`   • ${u.nome}`);
      console.log(`     - Carga: ${u.demanda_carga || 0} kW | Geração: ${u.demanda_geracao || 0} kW`);
      console.log(`     - Irrigante: ${u.irrigante ? 'SIM' : 'NÃO'}`);
    });
  });

  console.log('\n\n💡 CONCLUSÃO:\n');
  console.log('As unidades com tipo "OUTRO" são:\n');

  const cargaEGeracao = outroUnits.filter(u => u.tipo_unidade === 'Carga e Geração');
  const soCarga = outroUnits.filter(u => u.tipo_unidade === 'Carga');

  if (cargaEGeracao.length > 0) {
    console.log(`✅ ${cargaEGeracao.length} unidades híbridas (Carga e Geração)`);
    console.log('   → Unidades que têm tanto carga quanto geração no mesmo ponto');
  }

  if (soCarga.length > 0) {
    console.log(`✅ ${soCarga.length} unidades de carga pura (principalmente Pivôs e Bombeamento)`);
    console.log('   → Equipamentos de irrigação que consomem energia mas não geram');
  }

  console.log('\n📌 IMPORTANTE:');
  console.log('tipo = "OUTRO" é usado para unidades que não são puramente UFV nem puramente Carga.');
  console.log('Essas unidades têm características especiais (híbridas ou equipamentos específicos).\n');

  await prisma.$disconnect();
}

analyzeOutroPattern().catch(console.error);
