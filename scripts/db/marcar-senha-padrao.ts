/**
 * SN-34: marca para trocar a senha quem ainda entra com a senha padrão antiga
 * ("Aupus123!"), que todo usuário recebia e que qualquer um conhecia.
 *
 * SQL não compara bcrypt; este script compara o hash de cada usuário ativo.
 * Por padrão é PRÉVIA (lista e não grava). Com --apply, marca
 * `deve_trocar_senha = true`: no próximo acesso a pessoa só consegue trocar a
 * senha. Rodar depois do SQL 2026-10-14-troca-de-senha-obrigatoria.sql.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/db/marcar-senha-padrao.ts
 *   npx ts-node -r tsconfig-paths/register scripts/db/marcar-senha-padrao.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const SENHA_PADRAO_ANTIGA = 'Aupus123!';
const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

async function main() {
  const usuarios = await prisma.usuarios.findMany({
    where: { deleted_at: null, senha: { not: null }, deve_trocar_senha: false },
    select: { id: true, email: true, senha: true },
  });

  const comPadrao: { id: string; email: string }[] = [];
  for (const u of usuarios) {
    // Hash de Laravel ($2y$) e de Node ($2a$/$2b$) são o mesmo bcrypt
    const hash = u.senha!.replace(/^\$2y\$/, '$2a$');
    if (await bcrypt.compare(SENHA_PADRAO_ANTIGA, hash).catch(() => false)) comPadrao.push(u);
  }

  console.log(`${usuarios.length} usuários ativos conferidos; ${comPadrao.length} ainda com a senha padrão:`);
  for (const u of comPadrao) console.log(`  - ${u.email}`);

  if (APPLY && comPadrao.length > 0) {
    const { count } = await prisma.usuarios.updateMany({
      where: { id: { in: comPadrao.map((u) => u.id) } },
      data: { deve_trocar_senha: true },
    });
    console.log(`Marcados: ${count}. Eles trocam a senha no próximo acesso.`);
  } else if (!APPLY) {
    console.log('PRÉVIA: nada gravado. Rode com --apply para marcar.');
  }
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
