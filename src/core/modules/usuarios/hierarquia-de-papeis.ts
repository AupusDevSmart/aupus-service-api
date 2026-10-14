/**
 * Hierarquia de papéis: quem pode dar um papel a alguém e mexer em quem já o tem.
 *
 * Uma regra só, valendo para todo caminho que mexe em usuário (criar, editar,
 * trocar o tipo, redefinir senha, foto, excluir, permissões diretas, planilha):
 *
 * - Lidar com um papel exige `usuarios.create_<papel>`. Papel sem essa
 *   permissão no catálogo (gerente, papéis legados como vendedor, ou usuário sem
 *   papel) exige `usuarios.manage`.
 * - `super_admin` é o topo: só ele lida com super_admin, e ele lida com todos.
 * - Permissão direta guarda só o que o papel não dá. Acrescentar uma exige
 *   `usuarios.manage` e que quem acrescenta também a tenha — ninguém dá o que
 *   não tem. Tirar não tem essa exigência.
 * - Ninguém muda o próprio tipo nem as próprias permissões.
 */

/** Quem está pedindo — o usuário do JWT (`req.user`). */
export interface Solicitante {
  id: string;
  role?: string | null;
  permissions: string[];
}

export const PAPEL_TOPO = 'super_admin';

export const permissaoDoPapel = (papel: string) => `usuarios.create_${papel}`;

/**
 * @param papelTemPermissaoPropria se `usuarios.create_<papel>` existe no catálogo de permissões
 */
export function podeLidarComPapel(
  solicitante: Solicitante,
  papel: string | null,
  papelTemPermissaoPropria: boolean,
): boolean {
  if (solicitante.role === PAPEL_TOPO) return true;
  if (papel === PAPEL_TOPO) return false;
  if (papel && papelTemPermissaoPropria) return solicitante.permissions.includes(permissaoDoPapel(papel));
  return solicitante.permissions.includes('usuarios.manage');
}

/** As permissões diretas novas que o solicitante não pode dar. */
export function extrasQueNaoPodeDar(solicitante: Solicitante, novas: string[]): string[] {
  if (solicitante.role === PAPEL_TOPO) return [];
  if (!solicitante.permissions.includes('usuarios.manage')) return novas;
  return novas.filter((p) => !solicitante.permissions.includes(p));
}

/** Compara ids de usuário com o padding do Char(26). */
export const mesmoUsuario = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim() === b.trim();
