/**
 * Quem vê o dinheiro da OS na tela: quem programa ou gerencia (planejador,
 * gerente, admin). O cliente (SERV-10) e, desde 28/out/2026, o técnico de campo
 * não veem — o corte é na API, não só na tela. Pela permissão, não pelo nome do
 * papel.
 *
 * O técnico ainda confere as despesas de campo no Executar (D2 do SN-93: o
 * previsto de hospedagem, pedágio..., o real e as não previstas): para quem
 * executa, a lista delas (`itens_orcamento`) vem inteira, e só ela. Decisão do
 * usuário: ele conhece esses valores (pagou), e tirar a conferência dele obrigaria
 * o escritório a lançar cada recibo.
 *
 * O PDF tem regra própria (só `execucao_os.manage`: SERV-9).
 */
// Quem edita instrução (manutencao.manage) ou monta proposta (solicitacoes.manage) também: sem o
// preço na resposta, salvar gravaria de volta o preço vazio (nenhum papel padrão muda com isso)
export const PERMISSOES_QUE_VEEM_CUSTOS = ['execucao_os.manage', 'programacao_os.manage', 'manutencao.manage', 'solicitacoes.manage'] as const;

/** O usuário da requisição: a JwtStrategy põe as permissões nele (o ScopedUser não as declara) */
type ComPermissoes = { id?: string; permissions?: string[] } | null | undefined;

/** Sem usuário é chamada interna (cron, outro service): vê tudo */
export const veOsCustos = (user?: ComPermissoes): boolean =>
  !user || PERMISSOES_QUE_VEEM_CUSTOS.some((p) => user.permissions?.includes(p));

/** Quem executa a OS confere as despesas de campo (e só elas) */
export const confereDespesas = (user?: ComPermissoes): boolean => Boolean(user?.permissions?.includes('execucao_os.executar'));

/**
 * A coluna de ordem da lista para quem pede: ordenar por custo contava a quem não vê
 * custos qual OS custou mais, mesmo com o valor nulo. Para ele, a ordem padrão.
 */
export const ordemPermitida = (coluna: string, user?: ComPermissoes): string =>
  !veOsCustos(user) && CAMPOS_DE_DINHEIRO.has(coluna) ? 'criado_em' : coluna;

/** Os campos de dinheiro da OS, da programação e das linhas delas: saem nulos */
const CAMPOS_DE_DINHEIRO = new Set([
  'orcamento_previsto',
  'ajustes_orcamento',
  'custo_real',
  'custos_adicionais',
  'custo_unitario',
  'custo_total',
  'custo_hora',
  'valor',
  'valor_original',
  'valor_real',
]);

/** Listas que só têm dinheiro (os outros custos da OS e o orçamento da programação): saem vazias */
const LISTAS_DE_DINHEIRO = new Set(['itens_orcamento', 'outros_custos']);

/**
 * As despesas de campo, para quem executa: da lista dos outros custos
 * (`itens_orcamento`, só no nível de cima da OS ou da programação), as previstas
 * de natureza DESPESA_CAMPO (hospedagem, alimentação, pedágio) e TODAS as não
 * previstas. O resto (o contrato do terceiro, a amortização do instrumento, o
 * veículo, o maquinário) é custo da empresa e sai. As não previstas vão todas: o
 * Executar manda a lista de volta, e a não prevista que não vem é apagada.
 */
const DESPESAS_DE_CAMPO = 'itens_orcamento';
const ehDespesaDeCampo = (item: unknown) =>
  ehObjetoSimples(item) && (item.nao_previsto === true || item.natureza === 'DESPESA_CAMPO');

/** O quadro de custos do detalhe da OS (`custos`, SN-93): sai nulo, e a tela não o desenha */
const BLOCOS_DE_DINHEIRO = new Set(['custos']);

/** Os preços dos cadastros (a instrução e as linhas dela): para quem não vê custos, nulos */
const CAMPOS_DE_PRECO = new Set(['preco_proprio', 'preco_base', 'preco_cadastro', 'custo_origem', 'subtotal', 'custo', 'custo_por_grupo']);

/** "R$ 1.234,56" no texto da trilha ("R$ 120,00/h informado", "de R$ 80,00 para R$ 95,00") */
const REAIS_NO_TEXTO = /R\$\s*-?\d[\d.]*(?:,\d+)?/g;

const ehObjetoSimples = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

interface Corte {
  /** Mantém a lista das despesas de campo inteira (quem executa a OS) */
  comDespesas?: boolean;
  /** Os campos que viram null, além dos de dinheiro da OS */
  extras?: Set<string>;
}

/**
 * A resposta sem dinheiro nenhum, para quem não vê os custos (`veOsCustos`).
 * Percorre a resposta inteira — a OS traz a programação, a trilha e as linhas
 * dentro dela —: campo de dinheiro vira null, lista de dinheiro vira vazia e o
 * valor em reais escrito no texto (a trilha diz "R$ 120,00/h") vira "R$ —".
 * Date, Decimal e outras instâncias ficam como estão (fora do campo de dinheiro).
 * `comDespesas`: a lista das despesas de campo passa inteira (quem executa).
 */
export function semDinheiro<T>(resposta: T, corte: Corte = {}): T {
  return limpar(resposta, corte, 0) as T;
}

/** A resposta da OS ou da programação para quem pede: inteira, só com as despesas de campo, ou sem dinheiro */
export function dinheiroPara<T>(user: ComPermissoes, resposta: T): T {
  return veOsCustos(user) ? resposta : semDinheiro(resposta, { comDespesas: confereDespesas(user) });
}

/** Os preços de um cadastro (a instrução: o preço de cada linha e o custo) para quem pede (28/out/2026) */
export function precosPara<T>(user: ComPermissoes, resposta: T): T {
  return veOsCustos(user) ? resposta : semDinheiro(resposta, { extras: CAMPOS_DE_PRECO });
}

/** O texto da trilha: o "R$ n" dele sai para quem não vê custos */
const TRILHA = 'historico';

function limpar(valor: unknown, corte: Corte, nivel: number, naTrilha = false): unknown {
  // Para quem executa, o "R$ n" sai só da trilha: os campos de texto que ele mesmo escreve (problemas
  // encontrados, observações) voltam no Executar, e o "R$ —" seria regravado no lugar do valor
  if (typeof valor === 'string') return !corte.comDespesas || naTrilha ? valor.replace(REAIS_NO_TEXTO, 'R$ —') : valor;
  // A lista de cima (a resposta paginada) não conta como nível: cada OS dela é o "de cima"
  if (Array.isArray(valor)) return valor.map((v) => limpar(v, corte, nivel, naTrilha));
  if (!ehObjetoSimples(valor)) return valor;
  const limpo: Record<string, unknown> = {};
  for (const [chave, v] of Object.entries(valor)) {
    if (corte.comDespesas && nivel === 0 && chave === DESPESAS_DE_CAMPO && Array.isArray(v)) limpo[chave] = v.filter(ehDespesaDeCampo);
    else if (CAMPOS_DE_DINHEIRO.has(chave) || BLOCOS_DE_DINHEIRO.has(chave) || corte.extras?.has(chave)) limpo[chave] = v === undefined ? undefined : null;
    else if (LISTAS_DE_DINHEIRO.has(chave)) limpo[chave] = Array.isArray(v) ? [] : v === undefined ? undefined : null;
    else limpo[chave] = limpar(v, corte, nivel + 1, naTrilha || chave === TRILHA);
  }
  return limpo;
}
