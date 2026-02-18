import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTiposUnidades() {
  console.log('\n🔍 TIPOS CADASTRADOS NA TABELA UNIDADES:\n');

  // Buscar todos os tipos distintos
  const tipos: any[] = await prisma.$queryRaw`
    SELECT DISTINCT tipo, COUNT(*) as quantidade
    FROM unidades
    WHERE deleted_at IS NULL
    GROUP BY tipo
    ORDER BY quantidade DESC
  `;

  if (tipos.length === 0) {
    console.log('❌ Nenhum tipo encontrado na tabela unidades\n');
    return;
  }

  console.log('📊 TIPOS E QUANTIDADE DE UNIDADES:\n');
  tipos.forEach((item, index) => {
    const tipo = item.tipo || '(NULL/Vazio)';
    console.log(`${index + 1}. ${tipo.padEnd(30)} | ${item.quantidade} unidade(s)`);
  });

  console.log(`\n📈 Total de tipos distintos: ${tipos.length}\n`);

  // Mostrar alguns exemplos de cada tipo
  console.log('\n📋 EXEMPLOS DE UNIDADES POR TIPO:\n');

  for (const item of tipos) {
    const tipoValue = item.tipo;
    const exemplos: any[] = await prisma.$queryRaw`
      SELECT id, nome, tipo, planta_id
      FROM unidades
      WHERE tipo = ${tipoValue} AND deleted_at IS NULL
      LIMIT 3
    `;

    console.log(`\n🏷️  Tipo: ${tipoValue || '(NULL)'} (${item.quantidade} total)`);
    exemplos.forEach((ex, idx) => {
      console.log(`   ${idx + 1}. ${ex.nome} (ID: ${ex.id.substring(0, 8)}...)`);
    });
  }

  console.log('\n');
  await prisma.$disconnect();
}

checkTiposUnidades().catch(console.error);
