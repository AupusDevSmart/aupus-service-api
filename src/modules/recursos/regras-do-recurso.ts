import { Prisma } from '@/core';

/**
 * As regras do recurso, as mesmas do AupusProject (SN-83: decisão do usuário,
 * as planilhas de um importam no outro). Lá elas moram no model `Recurso`, em
 * `Rubrica` e em `Amortizacao`; aqui num lugar só, usado pelo cadastro, pela
 * importação e pela proposta.
 */

/** As 6 categorias, na ordem em que a tela agrupa: o que a empresa põe, depois o que contrata ou gasta */
export const CATEGORIAS = ['MAO_DE_OBRA', 'MATERIAL', 'INSTRUMENTO', 'VEICULO', 'TERCEIRO', 'DESPESA_CAMPO'] as const;
export type Categoria = (typeof CATEGORIAS)[number];

/** Como o recurso é cobrado */
export const BASES = ['hora', 'diaria', 'unidade', 'km', 'fechado'] as const;
export type Base = (typeof BASES)[number];

/**
 * Quais bases cada categoria aceita, e a PRIMEIRA é o padrão. Material cobrado
 * por hora multiplicaria metro de cabo por duração de obra.
 */
export const BASES_POR_CATEGORIA: Record<Categoria, readonly Base[]> = {
  MAO_DE_OBRA: ['hora', 'diaria'],
  MATERIAL: ['unidade'],
  INSTRUMENTO: ['diaria'],
  VEICULO: ['km', 'diaria'],
  TERCEIRO: ['fechado'],
  DESPESA_CAMPO: ['diaria', 'fechado', 'hora'],
};

/** As seis rubricas de custo do orçamento, na ordem do quadro */
export const RUBRICAS = ['instrucoes', 'materiais', 'veiculos', 'combustivel', 'diarias', 'terceirizados'] as const;
export type Rubrica = (typeof RUBRICAS)[number];

/** A rubrica de cada categoria quando ninguém escolhe (combustível é despesa de campo que alguém classifica) */
export const RUBRICA_PADRAO: Record<Categoria, Rubrica> = {
  MAO_DE_OBRA: 'instrucoes',
  INSTRUMENTO: 'instrucoes',
  MATERIAL: 'materiais',
  VEICULO: 'veiculos',
  DESPESA_CAMPO: 'diarias',
  TERCEIRO: 'terceirizados',
};

/** A base vale para a categoria? Fora dela é recusa, não troca calada (o AupusProject responde 422) */
export const baseValeNaCategoria = (categoria: Categoria, base: string) => BASES_POR_CATEGORIA[categoria].includes(base as Base);

/**
 * Centavos, metade para longe do zero, como o `round($x, 2)` do PHP: o
 * Math.round em float dava 1,00 onde o AupusProject dá 1,01 (100,50 / 100).
 */
export const centavos = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

/** Os campos de cada categoria; o resto é limpo ao gravar (como no AupusProject) */
const SO_DA_MAO_DE_OBRA = ['funcao'] as const;
const SO_DO_INSTRUMENTO = ['valor_aquisicao', 'prazo_retorno_meses', 'meta_utilizacao_horas'] as const;

export interface DadosDoRecurso {
  categoria: Categoria;
  base_calculo?: string | null;
  rubrica?: string | null;
  funcao?: string | null;
  valor_aquisicao?: number | null;
  prazo_retorno_meses?: number | null;
  custos_anuais?: number | null;
  meta_utilizacao_horas?: number | null;
}

/**
 * A base e a rubrica nunca entram vazias nem fora da categoria (cai no padrão
 * dela), e os campos que não são da categoria saem limpos. Sem isso a base
 * nula mandava a conta para o ramo errado sem erro nenhum.
 */
export function normalizarRecurso<T extends DadosDoRecurso>(dados: T): T {
  const bases = BASES_POR_CATEGORIA[dados.categoria];
  const saida: T = { ...dados };
  if (!dados.base_calculo || !bases.includes(dados.base_calculo as Base)) saida.base_calculo = bases[0];
  if (!dados.rubrica || !RUBRICAS.includes(dados.rubrica as Rubrica)) saida.rubrica = RUBRICA_PADRAO[dados.categoria];
  if (dados.categoria !== 'MAO_DE_OBRA') for (const campo of SO_DA_MAO_DE_OBRA) saida[campo] = null;
  if (dados.categoria !== 'INSTRUMENTO') {
    for (const campo of SO_DO_INSTRUMENTO) saida[campo] = null;
    saida.custos_anuais = 0;
  }
  return saida;
}

const numero = (v: Prisma.Decimal | number | null | undefined) =>
  v === null || v === undefined ? null : typeof v === 'number' ? v : v.toNumber();

/**
 * O custo por hora de uso do item próprio (a amortização):
 * (investimento ÷ anos de retorno + custos anuais) ÷ meta de utilização.
 * Nulo, nunca zero, quando não dá para calcular: zero diria que é de graça.
 */
export function custoHora(r: {
  valor_aquisicao?: Prisma.Decimal | number | null;
  prazo_retorno_meses?: number | null;
  custos_anuais?: Prisma.Decimal | number | null;
  meta_utilizacao_horas?: Prisma.Decimal | number | null;
}): number | null {
  const meta = numero(r.meta_utilizacao_horas) ?? 0;
  if (meta <= 0) return null;
  const investimento = numero(r.valor_aquisicao) ?? 0;
  const anuais = numero(r.custos_anuais) ?? 0;
  if (investimento <= 0 && anuais <= 0) return null;
  // Prazo ausente ou menor que um ano: o investimento inteiro pesa no ano
  const anos = Math.max((r.prazo_retorno_meses || 12) / 12, 1);
  return centavos((investimento / anos + anuais) / meta);
}

/** De onde sai o custo apurado (as mesmas chaves do AupusProject) */
export type OrigemDoCusto = 'amortizacao' | 'diaria_do_cadastro' | 'preco_fixo' | 'preco_unitario';

/**
 * O preço de UMA unidade da cobrança e de onde ele sai. O instrumento por
 * diária deriva da amortização vezes a jornada e cai na diária digitada quando
 * falta. A mão de obra no AupusProject sai do HH médio da função; o Service
 * não tem o custo das pessoas, então vale o preço do cadastro (premissa SN-83).
 */
export function custoApurado(r: {
  categoria: string;
  base_calculo: string;
  preco_unitario?: Prisma.Decimal | number | null;
  horas_por_diaria?: number | null;
  valor_aquisicao?: Prisma.Decimal | number | null;
  prazo_retorno_meses?: number | null;
  custos_anuais?: Prisma.Decimal | number | null;
  meta_utilizacao_horas?: Prisma.Decimal | number | null;
}): { custo_hora: number | null; preco_base: number | null; custo_origem: OrigemDoCusto | null } {
  const preco = numero(r.preco_unitario);
  if (r.categoria === 'INSTRUMENTO') {
    const hora = custoHora(r);
    if (r.base_calculo === 'diaria' && hora !== null) {
      return { custo_hora: hora, preco_base: centavos(hora * Math.max(r.horas_por_diaria ?? 8, 1)), custo_origem: 'amortizacao' };
    }
    return { custo_hora: hora, preco_base: preco, custo_origem: preco === null ? null : 'diaria_do_cadastro' };
  }
  const origem = r.categoria === 'MAO_DE_OBRA' ? 'preco_fixo' : 'preco_unitario';
  return { custo_hora: null, preco_base: preco, custo_origem: preco === null ? null : origem };
}

/** A unidade da linha da instrução que conta em horas ("h", "hora", "horas", "hr", "hs") */
const EM_HORAS = /^(h|hr|hrs|hs|hora|horas)$/;

/**
 * Quantas unidades da cobrança a linha da instrução consome. Hoje a linha só
 * tem a quantidade, na unidade dela (o "2 h" do técnico): a duração, a perda e
 * o km da linha chegam no SN-85, com a conta inteira do AupusProject.
 *
 * O instrumento passou a ser cobrado por diária (SN-83). A linha antiga, em
 * horas, vira diárias arredondadas para cima — 2 h de megôhmetro é 1 diária —
 * e não 2 diárias: multiplicar as horas pelo preço da diária dava 8 vezes o
 * valor. A mesma regra vale para a mão de obra cobrada por diária.
 */
export function quantidadeNaBase(
  recurso: { base_calculo: string; horas_por_diaria?: number | null },
  linha: { quantidade?: Prisma.Decimal | number | string | null; unidade?: string | null },
): number {
  const quantidade = Number(linha.quantidade ?? 1) || 1;
  const emHoras = EM_HORAS.test((linha.unidade ?? '').trim().toLowerCase());
  if (recurso.base_calculo === 'diaria' && emHoras) return Math.ceil(quantidade / Math.max(recurso.horas_por_diaria ?? 8, 1));
  return quantidade;
}

/** O custo da linha: o preço de uma unidade da cobrança vezes as unidades. Nulo sem preço (nunca zero) */
export function subtotalDaLinha(
  recurso: Parameters<typeof custoApurado>[0],
  linha: Parameters<typeof quantidadeNaBase>[1],
): number | null {
  const { preco_base } = custoApurado(recurso);
  return preco_base === null ? null : centavos(preco_base * quantidadeNaBase(recurso, linha));
}
