import { Prisma } from '@/core';
import { RUBRICAS, centavos, custoHora, type Rubrica } from '../recursos/regras-do-recurso';

/**
 * As regras do maquinário, as mesmas do AupusProject (SN-84; lá em
 * `Maquinario` e `CustoInstrucaoService::precoDaBaseDoMaquinario`). Não é
 * recurso: tem cadastro e tela próprios. A regra de custo é a do instrumento
 * (a mesma `custoHora`): uma segunda cópia da fórmula faria a mesma betoneira
 * custar diferente como instrumento e como maquinário.
 */

export const TIPOS = ['proprio', 'locacao'] as const;
export type Tipo = (typeof TIPOS)[number];

/** Diária para o próprio e a locação por dia; hora (guindaste); km; fechado (a mobilização). A primeira é o padrão */
export const BASES = ['diaria', 'hora', 'km', 'fechado'] as const;
export type Base = (typeof BASES)[number];

/** A locação é serviço contratado de fora; a máquina própria é trabalho técnico, como o instrumento */
export const RUBRICA_PADRAO: Record<Tipo, Rubrica> = { proprio: 'instrucoes', locacao: 'terceirizados' };

export interface DadosDoMaquinario {
  tipo: Tipo;
  base_calculo?: string | null;
  rubrica?: string | null;
}

/** A base fora da lista cai na diária; a rubrica vazia ou fora da lista, no padrão do tipo */
export function normalizarMaquinario<T extends DadosDoMaquinario>(dados: T): T {
  const saida: T = { ...dados };
  if (!dados.base_calculo || !BASES.includes(dados.base_calculo as Base)) saida.base_calculo = BASES[0];
  if (!dados.rubrica || !RUBRICAS.includes(dados.rubrica as Rubrica)) saida.rubrica = RUBRICA_PADRAO[dados.tipo];
  return saida;
}

const numero = (v: Prisma.Decimal | number | null | undefined) =>
  v === null || v === undefined ? null : typeof v === 'number' ? v : v.toNumber();

/**
 * O preço de UMA unidade da cobrança e de onde sai: na diária, a amortização
 * vezes a jornada, ou a diária digitada quando faltam investimento e meta; nas
 * outras bases, o preço digitado. "Diária do cadastro" só existe no próprio: na
 * locação o preço digitado É a fonte, não um substituto.
 */
export function custoApuradoDoMaquinario(m: {
  tipo: string;
  base_calculo: string;
  preco_unitario?: Prisma.Decimal | number | null;
  horas_por_diaria?: number | null;
  valor_aquisicao?: Prisma.Decimal | number | null;
  prazo_retorno_meses?: number | null;
  custos_anuais?: Prisma.Decimal | number | null;
  meta_utilizacao_horas?: Prisma.Decimal | number | null;
}): { custo_hora: number | null; preco_base: number | null; custo_origem: 'amortizacao' | 'diaria_do_cadastro' | 'preco_unitario' | null } {
  const hora = custoHora(m);
  const preco = numero(m.preco_unitario);
  const precoBase =
    m.base_calculo === 'diaria' && hora !== null ? centavos(hora * Math.max(m.horas_por_diaria ?? 8, 1)) : preco;

  if (m.base_calculo === 'diaria' && m.tipo === 'proprio') {
    const origem = hora !== null ? 'amortizacao' : preco !== null ? 'diaria_do_cadastro' : null;
    return { custo_hora: hora, preco_base: precoBase, custo_origem: origem };
  }
  return { custo_hora: hora, preco_base: precoBase, custo_origem: preco === null ? null : 'preco_unitario' };
}
