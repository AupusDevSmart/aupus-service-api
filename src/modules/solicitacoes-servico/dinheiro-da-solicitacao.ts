import { semReaisNoTexto } from '../execucao-os/quem-ve-os-custos';

type Usuario = { id?: string; permissions?: string[] } | null | undefined;

/**
 * Quanto da proposta quem pede vê (28/out/2026):
 * - `inteira`: quem monta proposta (`solicitacoes.manage`) e a chamada interna;
 * - `do_cliente`: o dono da planta da solicitação — a proposta é dele, como no
 *   PDF que recebe: os preços de venda e os totais (o da Aupus, o faturamento
 *   direto e o global), sem o custo, o imposto, a margem e a administração em %
 *   (29/out/2026: a conta é por imposto e margem). Na proposta de antes (BDI), o
 *   PDF dele mostrava o custo e o BDI em %, e segue mostrando; a composição do
 *   BDI (os nove componentes, com o lucro), não.
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

/** Os nove componentes do BDI (a conta de antes de 29/out/2026, nas propostas que ficam como documento) */
const CAMPOS_DO_BDI = [
  'bdi_administracao_central',
  'bdi_seguro_garantia',
  'bdi_taxa_risco',
  'bdi_despesas_financeiras',
  'bdi_lucro',
  'bdi_pis',
  'bdi_cofins',
  'bdi_cprb',
  'bdi_issqn',
];

/** A composição do BDI e as colunas órfãs de lucro e imposto (a margem) */
const COMPOSICAO = [...CAMPOS_DO_BDI, 'bdi_regime', 'lucro_percentual', 'aliquota_percentual', 'total_imposto', 'total_lucro'];

/**
 * A memória da conta nova (29/out/2026): os percentuais, a margem, o imposto e o
 * custo dos serviços. O planejamento que só a equipe usa (km, pessoas, noites)
 * vai junto; os dias previstos (o prazo) o cliente vê.
 */
const DA_CONTA_NOVA = [
  'imposto_percentual',
  'margem_percentual',
  'adm_servicos_percentual',
  'adm_fd_percentual',
  'margem_efetiva',
  'valor_imposto',
  'total_servicos',
  'total_custo',
  'distancia_km',
  'distancia_ida_volta_km',
  'deslocamento_interno_km',
  'pessoas_previstas',
  'noites_fora',
  'planejamento_calculado',
  'logistica_automatica',
];

/** Os totais da proposta e o custo estimado: o que o PDF do cliente mostra */
const TOTAIS = [
  'bdi_percentual',
  'total_custo',
  'total_bdi',
  'total_geral',
  'total_desconto',
  'desconto_tipo',
  'desconto_valor',
  'custo_estimado',
  'total_fd',
  'total_administracao',
  'total_aupus',
];

/** O que o cliente não vê: a composição, e da conta nova a memória (a de antes mostrava o custo) */
const doCliente = (conta: unknown) => (conta === 'BDI' ? COMPOSICAO : [...COMPOSICAO, ...DA_CONTA_NOVA]);

const nulos = (campos: string[], de: object) => Object.fromEntries(campos.filter((c) => c in de).map((c) => [c, null]));

/** As ações do histórico cujo texto é da equipe: o motivo de reabrir a proposta */
const TEXTO_DA_EQUIPE = new Set(['PROPOSTA_REABERTA']);

/**
 * O histórico da solicitação para quem não monta proposta (29/out/2026): sem os reais
 * no texto (a conversão do BDI escreve "de R$ X para R$ Y") e sem o motivo que a
 * equipe deu para reabrir (a margem, o preço), como o comentário interno.
 */
function historicoPara<T extends { acao?: string | null; observacoes?: string | null }>(historico: T[]): T[] {
  return historico.map((h) => ({
    ...h,
    observacoes: h.acao && TEXTO_DA_EQUIPE.has(h.acao) ? 'Proposta reaberta' : h.observacoes ? semReaisNoTexto(h.observacoes) : h.observacoes,
  }));
}

/** A linha da solicitação (lista, detalhe, criar, editar) para quem pede: o dono pela planta que vem nela */
export function solicitacaoPara<
  T extends {
    planta?: { proprietario_id?: string | null } | null;
    conta_da_proposta?: string | null;
    historico?: Array<{ acao?: string | null; observacoes?: string | null }>;
  },
>(user: Usuario, solicitacao: T): T {
  const nivel = nivelDaProposta(user, solicitacao.planta?.proprietario_id);
  if (nivel === 'inteira') return solicitacao;
  const campos = nivel === 'do_cliente' ? doCliente(solicitacao.conta_da_proposta) : [...COMPOSICAO, ...DA_CONTA_NOVA, ...TOTAIS];
  return {
    ...solicitacao,
    ...nulos(campos, solicitacao),
    ...(Array.isArray(solicitacao.historico) && { historico: historicoPara(solicitacao.historico) }),
  };
}

interface PropostaLida {
  conta_da_proposta: string;
  itens: Array<Record<string, unknown>>;
  outros_custos: Array<Record<string, unknown>>;
  logistica: Array<Record<string, unknown>>;
}

/** O dinheiro de uma linha de logística: o valor de cada coluna e o total (a quantidade, os dias e o km não) */
const DINHEIRO_DA_LOGISTICA = ['valor_unitario', 'valor_km', 'valor_fixo', 'total'];

/** A proposta (GET :id/proposta) para o nível de quem pede */
export function propostaPara<T extends PropostaLida>(nivel: NivelDaProposta, proposta: T): T {
  if (nivel === 'inteira') return proposta;
  const contaNova = proposta.conta_da_proposta !== 'BDI';
  // O preço de cadastro de cada instrução, a lista das sem preço e a memória da conta são internos
  const semComposicao = {
    ...proposta,
    ...nulos(doCliente(proposta.conta_da_proposta), proposta),
    fechamento: null,
    instrucoes_sem_preco: [],
    // Na conta nova, o preço da linha é custo: o cliente vê o de venda (`valor_venda`)
    itens: proposta.itens.map((item) => ({ ...item, preco_unitario_original: null, ...(contaNova && { preco_unitario: null }) })),
    // Os adicionais da Aupus são custo (o cliente vê a venda deles numa linha); o faturamento direto ele paga
    outros_custos: contaNova ? proposta.outros_custos.map((c) => (c.faturamento_direto ? c : { ...c, valor: null })) : proposta.outros_custos,
    // As tabelas de frete, deslocamento e diárias nunca vão ao cliente (a spec): a venda delas é uma linha
    logistica: [],
  };
  if (nivel === 'do_cliente') return semComposicao;
  return {
    ...semComposicao,
    ...nulos([...DA_CONTA_NOVA, ...TOTAIS], proposta),
    venda: null,
    itens: proposta.itens.map((item) => ({ ...item, preco_unitario: null, preco_unitario_original: null, valor_venda: null })),
    outros_custos: proposta.outros_custos.map((custo) => ({ ...custo, valor: null })),
    // Quem executa vê o que vai (o veículo, as diárias), sem o dinheiro
    logistica: proposta.logistica.map((linha) => ({ ...linha, ...nulos(DINHEIRO_DA_LOGISTICA, linha) })),
  };
}
