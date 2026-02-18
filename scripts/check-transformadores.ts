import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTransformadores() {
  console.log('\n🔍 TIPOS DE TRANSFORMADOR CADASTRADOS:\n');

  const tipos = await prisma.tipos_equipamentos.findMany({
    where: {
      OR: [
        { codigo: { contains: 'TRANSFORMADOR', mode: 'insensitive' } },
        { codigo: { contains: 'TRAFO', mode: 'insensitive' } },
        { nome: { contains: 'transformador', mode: 'insensitive' } },
        { nome: { contains: 'trafo', mode: 'insensitive' } }
      ]
    },
    select: {
      id: true,
      codigo: true,
      nome: true,
      categoria: true
    },
    orderBy: { nome: 'asc' }
  });

  if (tipos.length === 0) {
    console.log('❌ Nenhum tipo de transformador encontrado\n');
    return;
  }

  tipos.forEach((tipo, index) => {
    console.log(`${index + 1}. Código: ${tipo.codigo}`);
    console.log(`   Nome: ${tipo.nome}`);
    console.log(`   Categoria: ${tipo.categoria || 'N/A'}`);
    console.log('');
  });

  console.log(`\n📊 Total: ${tipos.length} tipos de transformador\n`);

  await prisma.$disconnect();
}

checkTransformadores().catch(console.error);
