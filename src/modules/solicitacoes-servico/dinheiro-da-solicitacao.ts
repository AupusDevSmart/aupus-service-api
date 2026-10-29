import { CAMPOS_DO_BDI } from './bdi-padrao';

type Usuario = { id?: string; permissions?: string[] } | null | undefined;

/**
 * Quanto da proposta quem pede vê (28/out/2026):
 * - `inteira`: quem monta proposta (`solicitacoes.manage`) e a chamada interna;
 * - `do_cliente`: o dono da planta da solicitação — a proposta é dele, como no
 *   PDF que recebe (os valores, o BDI em % e o total), sem a memória de cálculo do
 *   BDI (os nove componentes, com o lucro e a administração: a margem da empresa).
 *   Pelo dono ATUAL da planta, e não pelo `proprietario_id` gravado na solicitação:
 *   esse vinha do corpo do cadastro, e o técnico virava "dono" mandando o próprio id;
 * - `nenhuma`: os outros, como o técnico de campo, que não vê dinheiro.
 */
export type NivelDaProposta = 'inteira' | 'do_cliente' | 'nenhuma';

export function nivelDaProposta(user: Usuario, donoDaPlanta: string | null | undefined): NivelDaProposta {
  if (!user || user.permissions?.includes('solicitacoes.manage')) return 'inteira';
  const dono = donoDaPlanta?.trim();
  if (dono && dono === user.id?.trim()) return 'do_cliente';
  return 'nenhuma';
}

/** A composição do BDI e as colunas órfãs de lucro e imposto (a margem) */
const COMPOSICAO = [...CAMPOS_DO_BDI, 'bdi_regime', 'lucro_percentual', 'aliquota_percentual', 'total_imposto', 'total_lucro'];

/** Os totais da proposta e o custo estimado: o que o PDF do cliente mostra */
const TOTAIS = ['bdi_percentual', 'total_custo', 'total_bdi', 'total_geral', 'total_desconto', 'desconto_tipo', 'desconto_valor', 'custo_estimado'];

const nulos = (campos: string[], de: object) => Object.fromEntries(campos.filter((c) => c in de).map((c) => [c, null]));

/** A linha da solicitação (lista, detalhe, criar, editar) para quem pede: o dono pela planta que vem nela */
export function solicitacaoPara<T extends { planta?: { proprietario_id?: string | null } | null }>(user: Usuario, solicitacao: T): T {
  const nivel = nivelDaProposta(user, solicitacao.planta?.proprietario_id);
  if (nivel === 'inteira') return solicitacao;
  return { ...solicitacao, ...nulos(nivel === 'do_cliente' ? COMPOSICAO : [...COMPOSICAO, ...TOTAIS], solicitacao) };
}

interface PropostaLida {
  itens: Array<Record<string, unknown>>;
  outros_custos: Array<Record<string, unknown>>;
}

/** A proposta (GET :id/proposta) para o nível de quem pede */
export function propostaPara<T extends PropostaLida>(nivel: NivelDaProposta, proposta: T): T {
  if (nivel === 'inteira') return proposta;
  // O preço de cadastro de cada instrução e a lista das sem preço são internos: o PDF não os usa
  const semComposicao = {
    ...proposta,
    ...nulos([...CAMPOS_DO_BDI, 'bdi_regime'], proposta),
    instrucoes_sem_preco: [],
    itens: proposta.itens.map((item) => ({ ...item, preco_unitario_original: null })),
  };
  if (nivel === 'do_cliente') return semComposicao;
  return {
    ...semComposicao,
    ...nulos(TOTAIS, proposta),
    itens: proposta.itens.map((item) => ({ ...item, preco_unitario: null, preco_unitario_original: null })),
    outros_custos: proposta.outros_custos.map((custo) => ({ ...custo, valor: null })),
  };
}
