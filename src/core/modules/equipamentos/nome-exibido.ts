/**
 * Faz o equipamento se apresentar com o nome da POSICAO.
 *
 * Quem escolhe um equipamento no sistema quer ver "Inversor 1", nao
 * "Growatt MAX 100KTL3 SN-88214". O nome da posicao e o que identifica o ativo
 * para quem opera; o do equipamento identifica a peca.
 *
 * A substituicao acontece aqui, na borda da API, e nao em cada tela. `nome` e
 * lido em 89 pontos do sistema — 65 deles no supervisorio, que nem participa
 * desta mudanca. Trocar campo em 89 lugares para exibir a mesma coisa seria
 * espalhar a reforma por dois produtos sem necessidade; devolvendo o nome certo
 * no campo que ja e consumido, nenhum deles precisa mudar.
 *
 * O nome proprio do equipamento nao se perde: vai em `nome_proprio`, para o
 * sheet do equipamento e para as telas que precisam distinguir a peca.
 */

/** O que se le do equipamento: o nome dele e, quando a consulta incluiu, a posicao. */
type Nomeavel = { nome?: string | null; ativo_funcional?: { nome?: string | null } | null };

/** O equipamento como sai daqui: `nome` pode ser o da posicao, e o dele vai em `nome_proprio`. */
export type ComNomeDaPosicao<T extends Nomeavel> = T & { nome_proprio: T['nome'] };

/** Quando a posicao existe e tem nome, e ela quem nomeia. */
function nomeDaPosicao(equipamento: Nomeavel): string | null {
  const daPosicao = equipamento?.ativo_funcional?.nome;
  if (typeof daPosicao !== 'string') return null;
  const limpo = daPosicao.trim();
  return limpo.length > 0 ? limpo : null;
}

function aplicarEmUm<T extends Nomeavel>(equipamento: T): ComNomeDaPosicao<T> {
  // O que nao e objeto volta como veio
  if (!equipamento || typeof equipamento !== 'object') return equipamento as ComNomeDaPosicao<T>;

  // Ausencia da relacao nao e ausencia de posicao — e consulta que nao a
  // incluiu. Tratar as duas igual apagaria o nome em toda rota sem `include`.
  const daPosicao = nomeDaPosicao(equipamento);

  return {
    ...equipamento,
    nome: daPosicao ?? equipamento.nome,
    nome_proprio: equipamento.nome,
  };
}

export function comNomeDaPosicao<T extends Nomeavel>(entrada: T[]): ComNomeDaPosicao<T>[];
export function comNomeDaPosicao<T extends Nomeavel>(entrada: T): ComNomeDaPosicao<T>;
export function comNomeDaPosicao<T extends Nomeavel>(entrada: T | T[]): ComNomeDaPosicao<T> | ComNomeDaPosicao<T>[] {
  // null e undefined voltam como vieram
  if (entrada === null || entrada === undefined) return entrada as ComNomeDaPosicao<T>;
  if (Array.isArray(entrada)) return entrada.map(aplicarEmUm);
  return aplicarEmUm(entrada);
}
