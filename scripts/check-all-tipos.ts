import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAllTipos() {
  console.log('\n🔍 TODOS OS TIPOS DE EQUIPAMENTOS CADASTRADOS:\n');

  const tipos: any[] = await prisma.$queryRaw`
    SELECT
      te.id,
      te.codigo,
      te.nome,
      ce.nome as categoria
    FROM tipos_equipamentos te
    LEFT JOIN categorias_equipamentos ce ON te.categoria_id = ce.id
    ORDER BY ce.nome, te.nome
  `;

  if (tipos.length === 0) {
    console.log('❌ Nenhum tipo cadastrado\n');
    return;
  }

  // Agrupar por categoria
  const porCategoria = tipos.reduce((acc, tipo) => {
    const cat = tipo.categoria || 'Sem Categoria';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(tipo);
    return acc;
  }, {} as Record<string, typeof tipos>);

  Object.entries(porCategoria).forEach(([categoria, tiposCategoria]) => {
    const lista = tiposCategoria as any[];
    console.log(`\n📦 ${categoria} (${lista.length} tipos):`);
    lista.forEach(tipo => {
      console.log(`   - ${tipo.codigo.padEnd(30)} | ${tipo.nome}`);
    });
  });

  console.log(`\n\n📊 Total: ${tipos.length} tipos de equipamento cadastrados\n`);

  await prisma.$disconnect();
}

checkAllTipos().catch(console.error);
