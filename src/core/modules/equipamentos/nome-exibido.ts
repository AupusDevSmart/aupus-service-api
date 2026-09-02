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

/** Quando a posicao existe e tem nome, e ela quem nomeia. */
function nomeDaPosicao(equipamento: any): string | null {
  const daPosicao = equipamento?.ativo_funcional?.nome;
  if (typeof daPosicao !== 'string') return null;
  const limpo = daPosicao.trim();
  return limpo.length > 0 ? limpo : null;
}

function aplicarEmUm(equipamento: any): any {
  if (!equipamento || typeof equipamento !== 'object') return equipamento;

  // Ausencia da relacao nao e ausencia de posicao — e consulta que nao a
  // incluiu. Tratar as duas igual apagaria o nome em toda rota sem `include`.
  const daPosicao = nomeDaPosicao(equipamento);

  return {
    ...equipamento,
    nome: daPosicao ?? equipamento.nome,
    nome_proprio: equipamento.nome,
  };
}

export function comNomeDaPosicao(entrada: any): any {
  if (entrada === null || entrada === undefined) return entrada;
  if (Array.isArray(entrada)) return entrada.map(aplicarEmUm);
  return aplicarEmUm(entrada);
}
