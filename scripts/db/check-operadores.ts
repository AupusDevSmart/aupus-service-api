import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const operadores = await prisma.usuarios.findMany({
    where: {
      role: { equals: 'operador', mode: 'insensitive' },
      deleted_at: null,
      is_active: true,
    },
    select: { id: true, nome: true, email: true, role: true, status: true },
  });
  console.log(`Total: ${operadores.length}`);
  operadores.forEach((u) => console.log(`  - ${u.nome} (${u.email}) role=${u.role} status=${u.status}`));
}
main().finally(() => prisma.$disconnect());
