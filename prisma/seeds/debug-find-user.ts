import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
(async () => {
  const needle = process.argv[2] || 'pjlinardelli';
  const users = await prisma.usuarios.findMany({
    where: { OR: [{ email: { contains: needle } }, { nome: { contains: needle, mode: 'insensitive' } }] },
    select: { id: true, nome: true, email: true, role: true },
    take: 20,
  });
  console.log(`Encontrados ${users.length}:`);
  users.forEach((u) => console.log(`  id="${u.id}" email="${u.email}" nome="${u.nome}" role=${u.role}`));
  await prisma.$disconnect();
})();
