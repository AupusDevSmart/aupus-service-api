const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Verificando equipamentos cadastrados...\n');

  // 1. Buscar todos os equipamentos
  const equipamentos = await prisma.equipamentos.findMany({
    where: {
      deleted_at: null
    },
    select: {
      id: true,
      nome: true,
      tipo_equipamento: true,
      classificacao: true,
      tipo_equipamento_rel: {
        select: {
          nome: true,
          codigo: true,
          categoria: true
        }
      }
    }
  });

  console.log(`📊 Total de equipamentos: ${equipamentos.length}\n`);

  // 2. Agrupar por tipo
  const porTipo = {};
  equipamentos.forEach(equip => {
    const tipo = equip.tipo_equipamento || 'SEM_TIPO';
    if (!porTipo[tipo]) {
      porTipo[tipo] = [];
    }
    porTipo[tipo].push(equip);
  });

  console.log('📋 Equipamentos por tipo:\n');
  Object.keys(porTipo).sort().forEach(tipo => {
    console.log(`  ${tipo}: ${porTipo[tipo].length}`);
    porTipo[tipo].forEach(e => {
      console.log(`    - ${e.nome} (${e.classificacao || 'SEM CLASSIFICAÇÃO'})`);
    });
  });

  console.log('\n' + '='.repeat(60));

  // 3. Verificar inversores
  const inversores = equipamentos.filter(e =>
    e.tipo_equipamento?.includes('INVERSOR') ||
    e.nome?.toLowerCase().includes('inversor')
  );

  console.log(`\n⚡ INVERSORES ENCONTRADOS: ${inversores.length}`);
  inversores.forEach(inv => {
    console.log(`  - ${inv.nome}`);
    console.log(`    Tipo: ${inv.tipo_equipamento}`);
    console.log(`    Classificação: ${inv.classificacao || 'NÃO DEFINIDA'}`);
    console.log(`    Tipo correto?: ${inv.tipo_equipamento === 'INVERSOR_SOLAR' ? '✅ SIM' : '❌ NÃO'}`);
    console.log('');
  });

  // 4. Sugerir correções
  const precisamCorrecao = inversores.filter(inv =>
    inv.tipo_equipamento !== 'INVERSOR_SOLAR'
  );

  if (precisamCorrecao.length > 0) {
    console.log('\n⚠️ INVERSORES QUE PRECISAM DE CORREÇÃO:');
    precisamCorrecao.forEach(inv => {
      console.log(`  - ${inv.nome}: "${inv.tipo_equipamento}" → "INVERSOR_SOLAR"`);
    });

    console.log('\n💡 Para corrigir, rode o script: fix-inversores.js');
  } else {
    console.log('\n✅ Todos os inversores estão corretos!');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
