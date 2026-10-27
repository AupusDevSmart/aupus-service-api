/**
 * Quem vê o dinheiro da OS na tela (SERV-10): quem executa (o técnico de campo
 * confere os outros custos no Executar, D2 do SN-93) e quem programa ou gerencia.
 * O cliente só tem as permissões de leitura e não vê dinheiro nenhum — o corte
 * é na API, não só na tela. Pela permissão, não pelo nome do papel.
 *
 * O PDF tem regra própria, mais estreita (só `execucao_os.manage`: SERV-9).
 */
export const PERMISSOES_QUE_VEEM_CUSTOS = ['execucao_os.executar', 'execucao_os.manage', 'programacao_os.manage'] as const;

/** Sem usuário é chamada interna (cron, outro service): vê tudo */
export const veOsCustos = (user?: { permissions?: string[] } | null): boolean =>
  !user || PERMISSOES_QUE_VEEM_CUSTOS.some((p) => user.permissions?.includes(p));

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

/** O quadro de custos do detalhe da OS (`custos`, SN-93): sai nulo, e a tela não o desenha */
const BLOCOS_DE_DINHEIRO = new Set(['custos']);

/** "R$ 1.234,56" no texto da trilha ("R$ 120,00/h informado", "de R$ 80,00 para R$ 95,00") */
const REAIS_NO_TEXTO = /R\$\s*-?\d[\d.]*(?:,\d+)?/g;

const ehObjetoSimples = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/**
 * A resposta sem dinheiro nenhum, para quem não vê os custos (`veOsCustos`).
 * Percorre a resposta inteira — a OS traz a programação, a trilha e as linhas
 * dentro dela —: campo de dinheiro vira null, lista de dinheiro vira vazia e o
 * valor em reais escrito no texto (a trilha diz "R$ 120,00/h") vira "R$ —".
 * Date, Decimal e outras instâncias ficam como estão (fora do campo de dinheiro).
 */
export function semDinheiro<T>(resposta: T): T {
  return limpar(resposta) as T;
}

function limpar(valor: unknown): unknown {
  if (typeof valor === 'string') return valor.replace(REAIS_NO_TEXTO, 'R$ —');
  if (Array.isArray(valor)) return valor.map(limpar);
  if (!ehObjetoSimples(valor)) return valor;
  const limpo: Record<string, unknown> = {};
  for (const [chave, v] of Object.entries(valor)) {
    if (CAMPOS_DE_DINHEIRO.has(chave) || BLOCOS_DE_DINHEIRO.has(chave)) limpo[chave] = v === undefined ? undefined : null;
    else if (LISTAS_DE_DINHEIRO.has(chave)) limpo[chave] = Array.isArray(v) ? [] : v === undefined ? undefined : null;
    else limpo[chave] = limpar(v);
  }
  return limpo;
}
