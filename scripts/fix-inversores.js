const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Corrigindo tipos de inversores...\n');

  // Buscar todos os inversores
  const inversores = await prisma.equipamentos.findMany({
    where: {
      deleted_at: null,
      OR: [
        { nome: { contains: 'inversor', mode: 'insensitive' } },
        { nome: { contains: 'Inversor', mode: 'insensitive' } },
        { tipo_equipamento: { contains: 'INVERSOR' } },
      ]
    },
    select: {
      id: true,
      nome: true,
      tipo_equipamento: true
    }
  });

  console.log(`📊 Encontrados ${inversores.length} inversores\n`);

  // Filtrar apenas os que não estão corretos
  const  precisamCorrecao = inversores.filter(inv =>
    inv.tipo_equipamento !== 'INVERSOR_SOLAR'
  );

  console.log(`⚠️ ${precisamCorrecao.length} precisam de correção\n`);

  if (precisamCorrecao.length === 0) {
    console.log('✅ Nada a fazer!');
    return;
  }

  // Confirmar
  console.log('Inversores que serão corrigidos:');
  precisamCorrecao.forEach(inv => {
    console.log(`  - ${inv.nome}: "${inv.tipo_equipamento}" → "INVERSOR_SOLAR"`);
  });

  console.log('\n⏳ Iniciando correção...\n');

  // Atualizar todos
  let contador = 0;
  for (const inv of precisamCorrecao) {
    try {
      await prisma.equipamentos.update({
        where: { id: inv.id },
        data: { tipo_equipamento: 'INVERSOR_SOLAR' }
      });
      contador++;
      console.log(`  ✅ ${inv.nome}`);
    } catch (error) {
      console.log(`  ❌ Erro em ${inv.nome}:`, error.message);
    }
  }

  console.log(`\n🎉 Concluído! ${contador}/${precisamCorrecao.length} inversores corrigidos!`);
  console.log('\n💡 Agora recarregue o dashboard COA para ver a geração solar!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
