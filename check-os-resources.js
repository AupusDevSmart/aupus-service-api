const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const allOS = await prisma.ordens_servico.findMany({
    where: { numero_os: { startsWith: 'OS-2025-' } },
    include: {
      materiais: true,
      ferramentas: true,
      tecnicos: true
    },
    take: 10
  });

  console.log('OS com recursos:\n');
  allOS.forEach(os => {
    const mat = os.materiais?.length || 0;
    const fer = os.ferramentas?.length || 0;
    const tec = os.tecnicos?.length || 0;
    if (mat > 0 || fer > 0 || tec > 0) {
      console.log(`${os.numero_os}: Mat=${mat}, Fer=${fer}, Tec=${tec}`);
    }
  });

  await prisma.$disconnect();
}

check().catch(console.error);
