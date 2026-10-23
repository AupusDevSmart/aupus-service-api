/**
 * SN-34 / SN-45: quem ainda entra com a senha padrão antiga ("Aupus123!"), que
 * todo usuário recebia e que está no repositório público.
 *
 * SQL não compara bcrypt; este script compara o hash de cada usuário. Por
 * padrão é PRÉVIA (lista e não grava).
 *
 * - `--apply`: marca `deve_trocar_senha = true` — no próximo acesso a pessoa só
 *   consegue trocar a senha. Não basta sozinho: quem souber a senha padrão e
 *   entrar primeiro troca a senha e fica com a conta (SN-45).
 * - `--anular --apply`: ANULA a senha (fica nula: o login responde 401) das
 *   contas que não são da equipe interna; o dono entra pelo "esqueci a senha".
 *   A troca obrigatória sai junto: a senha que ele escolher no e-mail já é a
 *   dele. As contas internas (super_admin, admin, gerente, analista) ficam de
 *   fora e saem listadas: o dono troca na hora, ou a conta é inativada pela
 *   tela. Decisão do usuário no deploy de 23/out/2026. Confira antes que o
 *   "esqueci a senha" chega (o e-mail é o único caminho de volta).
 *
 * Rodar depois do SQL 2026-10-14-troca-de-senha-obrigatoria.sql.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/db/marcar-senha-padrao.ts
 *   npx ts-node -r tsconfig-paths/register scripts/db/marcar-senha-padrao.ts --apply
 *   npx ts-node -r tsconfig-paths/register scripts/db/marcar-senha-padrao.ts --anular
 *   npx ts-node -r tsconfig-paths/register scripts/db/marcar-senha-padrao.ts --anular --apply
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const SENHA_PADRAO_ANTIGA = 'Aupus123!';
const APPLY = process.argv.includes('--apply');
const ANULAR = process.argv.includes('--anular');
/** Equipe interna: não se anula a senha de quem administra (pode trancar o sistema); ela troca na hora */
const PAPEIS_INTERNOS = new Set(['super_admin', 'admin', 'gerente', 'analista']);
const prisma = new PrismaClient();

async function main() {
  // Para anular, também quem já está marcado: a marca não impede quem sabe a senha de entrar
  const usuarios = await prisma.usuarios.findMany({
    where: { deleted_at: null, senha: { not: null }, ...(ANULAR ? {} : { deve_trocar_senha: false }) },
    select: { id: true, email: true, senha: true },
  });

  const comPadrao: { id: string; email: string }[] = [];
  for (const u of usuarios) {
    // Hash de Laravel ($2y$) e de Node ($2a$/$2b$) são o mesmo bcrypt
    const hash = u.senha!.replace(/^\$2y\$/, '$2a$');
    if (await bcrypt.compare(SENHA_PADRAO_ANTIGA, hash).catch(() => false)) comPadrao.push(u);
  }

  console.log(`${usuarios.length} usuários conferidos; ${comPadrao.length} ainda com a senha padrão:`);
  for (const u of comPadrao) console.log(`  - ${u.email}`);

  if (ANULAR) return anular(comPadrao);

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

async function anular(comPadrao: { id: string; email: string }[]) {
  const vinculos = await prisma.model_has_roles.findMany({ include: { roles: true } });
  const papeisDe = new Map<string, string[]>();
  for (const v of vinculos) papeisDe.set(v.model_id.trim(), [...(papeisDe.get(v.model_id.trim()) ?? []), v.roles.name]);
  const interno = (id: string) => (papeisDe.get(id.trim()) ?? []).some((p) => PAPEIS_INTERNOS.has(p));

  const internas = comPadrao.filter((u) => interno(u.id));
  const anuladas = comPadrao.filter((u) => !interno(u.id));

  console.log(`\nFicam (equipe interna: o dono troca a senha já, ou inative a conta pela tela): ${internas.length}`);
  for (const u of internas) console.log(`  - ${u.email} (${papeisDe.get(u.id.trim())?.join(', ')})`);
  console.log(`\nSenha anulada (entram pelo "esqueci a senha"): ${anuladas.length}`);
  for (const u of anuladas) console.log(`  - ${u.email} (${papeisDe.get(u.id.trim())?.join(', ') || 'sem papel'})`);

  if (!APPLY) {
    console.log('\nPRÉVIA: nada gravado. Rode com --anular --apply para anular.');
    return;
  }
  if (anuladas.length === 0) return;
  const { count } = await prisma.usuarios.updateMany({
    where: { id: { in: anuladas.map((u) => u.id) } },
    data: { senha: null, deve_trocar_senha: false, updated_at: new Date() },
  });
  console.log(`\nAnuladas: ${count}.`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
