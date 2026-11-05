/**
 * O cliente (proprietario) cadastra planta só em nome próprio, e sem passá-la a
 * outro dono — o escopo dele é o das plantas de que é dono, e ela sairia das
 * plantas dele no mesmo instante (SN-75). Um lugar só para a tela e a
 * planilha, que já tinha esta regra desde out/2026 enquanto o formulário não
 * conferia nada.
 *
 * Só o cliente: o escopo do técnico (operador) vem do vínculo em
 * planta_operadores, não do dono — exigir que ele fosse o dono o impediria de
 * cadastrar qualquer planta (achado da revisão do SN-75). Admin, gerente e
 * analista não têm escopo.
 *
 * Proibição de dono, não de existência: 403, e não o 404 do escopo.
 */
export const SO_EM_NOME_PROPRIO = 'Você só pode criar plantas em que você é o proprietário.';
export const NAO_PASSA_A_OUTRO_DONO = 'Você não pode passar a planta para outro proprietário.';

/**
 * O problema com o dono, ou null. `donoAtual`: `undefined` = planta nova; `null` =
 * planta que existe sem dono (possível desde 05/nov/2026), que o cliente não toma
 * para si — antes os dois eram `null`, e assumir a planta sem dono passava por
 * "criar em nome próprio" (hoje o escopo responde 404 antes; a regra não depende dele).
 */
export function problemaNoDono(
  usuario: { id?: string; role?: string | null } | undefined,
  novoDono: string | null | undefined,
  donoAtual: string | null | undefined,
): string | null {
  if (usuario?.role !== 'proprietario') return null;
  const novo = novoDono?.trim();
  if (donoAtual === undefined) return novo === usuario.id?.trim() ? null : SO_EM_NOME_PROPRIO;
  if (donoAtual === null) return novoDono === undefined ? null : NAO_PASSA_A_OUTRO_DONO;
  // Ausente não mexe no dono. Desde que o dono é opcional (05/nov/2026), o vazio
  // (null) tiraria a planta dele: também é passar adiante
  if (novoDono === undefined) return null;
  return novo !== donoAtual.trim() ? NAO_PASSA_A_OUTRO_DONO : null;
}
