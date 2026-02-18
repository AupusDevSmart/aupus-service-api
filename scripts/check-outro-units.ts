import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkOutroUnits() {
  console.log('\n🔍 UNIDADES COM TIPO "OUTRO":\n');

  const outroUnits: any[] = await prisma.$queryRaw`
    SELECT
      u.id,
      u.nome,
      u.tipo,
      u.created_at,
      p.nome as planta_nome
    FROM unidades u
    LEFT JOIN plantas p ON u.planta_id = p.id
    WHERE u.tipo = 'OUTRO'
    AND u.deleted_at IS NULL
    ORDER BY u.created_at DESC
  `;

  if (outroUnits.length === 0) {
    console.log('✅ Nenhuma unidade com tipo OUTRO encontrada\n');
    return;
  }

  console.log(`📊 Total: ${outroUnits.length} unidades com tipo OUTRO\n`);

  outroUnits.forEach((unit, index) => {
    console.log(`${index + 1}. ${unit.nome}`);
    console.log(`   ID: ${unit.id}`);
    console.log(`   Planta: ${unit.planta_nome || 'N/A'}`);
    console.log(`   Criado em: ${unit.created_at}`);
    console.log('');
  });

  await prisma.$disconnect();
}

checkOutroUnits().catch(console.error);
