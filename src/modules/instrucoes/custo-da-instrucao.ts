import type { instrucao_maquinarios, instrucao_recursos, maquinarios, Prisma, recursos } from '@prisma/client';
import { centavos, custoApurado } from '../recursos/regras-do-recurso';
import { custoApuradoDoMaquinario } from '../maquinarios/regras-do-maquinario';

/**
 * O custo de uma instrução, a conta do AupusProject (SN-85): `BaseDeCusto` e
 * `CustoInstrucaoService`, num lugar só.
 *
 *   custo = Σ (quantidade × unidades da base × preço de uma unidade da base)
 *
 * | Base      | Unidades                                   |
 * | --------- | ------------------------------------------ |
 * | `hora`    | as horas da linha                          |
 * | `diaria`  | horas ÷ jornada, para cima (0 h = 0)       |
 * | `unidade` | quantidade × (1 + perda); a quantidade não multiplica de novo |
 * | `km`      | a distância da linha                       |
 * | `fechado` | 1                                          |
 *
 * O eixo é a BASE do item, não a categoria. O preço de uma unidade da base é o
 * custo apurado do cadastro (`custoApurado`, `custoApuradoDoMaquinario`), ou o
 * preço próprio da linha, que vale só nesta instrução.
 *
 * O front tem um espelho disto (`features/instrucoes/utils/custo-da-linha.ts`)
 * só para a tela mudar o total enquanto se digita: **mudou a fórmula aqui, muda
 * lá junto.**
 */

export const GRUPOS = ['recursos', 'maquinario', 'materiais'] as const;
export type Grupo = (typeof GRUPOS)[number];

type Numero = Prisma.Decimal | number | string | null | undefined;
const numero = (v: Numero) => (v === null || v === undefined || v === '' ? null : Number(v));
const ouZero = (v: Numero) => numero(v) ?? 0;

/** O que a conta lê da linha */
export interface DadosDaLinha {
  quantidade: number;
  duracao_horas: number;
  /** Fração: 0,10 é 10% */
  fator_perda: number;
  distancia_km: number | null;
  horas_por_diaria: number;
}

/** Quantas unidades da base a linha consome */
export function unidadesDaBase(base: string, linha: DadosDaLinha): number {
  switch (base) {
    case 'hora':
      return linha.duracao_horas;
    // Para cima, sempre: duas horas de drone ocupam o dia inteiro. Duração zero é nada usado
    case 'diaria':
      return linha.duracao_horas <= 0 ? 0 : Math.ceil(linha.duracao_horas / Math.max(linha.horas_por_diaria, 1));
    // A perda entra na QUANTIDADE (40 m com 10% são 44 m comprados): a linha também é a lista de compras
    case 'unidade':
      return Math.round((linha.quantidade * (1 + linha.fator_perda) + Number.EPSILON) * 10_000) / 10_000;
    case 'km':
      return linha.distancia_km ?? 0;
    // Fechado: o preço inteiro, uma vez por unidade de quantidade
    default:
      return 1;
  }
}

/**
 * Unidades vezes preço, vezes a quantidade quando ela não está embutida (na
 * base por unidade ela já está). Sem preço, nulo: a linha sem cadastro não pode
 * sumir do total calada, que sairia menor que a realidade parecendo completo.
 */
export function subtotalDaBase(base: string, linha: DadosDaLinha, unidades: number, preco: number | null): number | null {
  if (preco === null) return null;
  const multiplicador = base === 'unidade' ? 1 : linha.quantidade;
  return centavos(multiplicador * unidades * preco);
}

/** Uma linha da instrução com o custo aberto: a tela e a planilha mostram de onde vem o número */
export interface LinhaDeCusto {
  origem: 'recurso' | 'maquinario';
  grupo: Grupo;
  recurso_id: string | null;
  maquinario_id: string | null;
  nome: string;
  /** A categoria do recurso, ou "maquinario" */
  categoria: string;
  rubrica: string;
  base_calculo: string;
  quantidade: number;
  duracao_horas: number;
  fator_perda: number;
  fornecido_pelo_cliente: boolean;
  distancia_km: number | null;
  horas_por_diaria: number;
  unidades: number;
  /** O preço de uma unidade da base que a conta usou (o próprio, se houver) */
  preco_base: number | null;
  /** O do cadastro, para a tela mostrar de onde o próprio se afastou */
  preco_cadastro: number | null;
  preco_proprio: number | null;
  subtotal: number | null;
}

type LinhaDoRecurso = Pick<
  instrucao_recursos,
  'quantidade' | 'duracao_horas' | 'fator_perda' | 'fornecido_pelo_cliente' | 'distancia_km' | 'preco_proprio'
> & { recurso: recursos };

type LinhaDoMaquinario = Pick<instrucao_maquinarios, 'quantidade' | 'duracao_horas' | 'distancia_km' | 'preco_proprio'> & {
  maquinario: maquinarios;
};

export function linhaDoRecurso(linha: LinhaDoRecurso): LinhaDeCusto {
  const { recurso } = linha;
  const dados: DadosDaLinha = {
    quantidade: ouZero(linha.quantidade),
    duracao_horas: ouZero(linha.duracao_horas),
    fator_perda: ouZero(linha.fator_perda),
    distancia_km: numero(linha.distancia_km),
    horas_por_diaria: recurso.horas_por_diaria,
  };
  const precoCadastro = custoApurado(recurso).preco_base;
  const proprio = numero(linha.preco_proprio);
  const precoBase = proprio === null ? precoCadastro : centavos(proprio);
  const unidades = unidadesDaBase(recurso.base_calculo, dados);
  return {
    origem: 'recurso',
    grupo: recurso.categoria === 'MATERIAL' ? 'materiais' : 'recursos',
    recurso_id: recurso.id.trim(),
    maquinario_id: null,
    nome: recurso.nome,
    categoria: recurso.categoria,
    rubrica: recurso.rubrica,
    base_calculo: recurso.base_calculo,
    ...dados,
    fornecido_pelo_cliente: linha.fornecido_pelo_cliente,
    unidades,
    preco_base: precoBase,
    preco_cadastro: precoCadastro,
    preco_proprio: proprio,
    // O que o cliente fornece entra no escopo e não no custo, e não precisa de preço para estar completo
    subtotal: linha.fornecido_pelo_cliente ? 0 : subtotalDaBase(recurso.base_calculo, dados, unidades, precoBase),
  };
}

export function linhaDoMaquinario(linha: LinhaDoMaquinario): LinhaDeCusto {
  const { maquinario } = linha;
  const dados: DadosDaLinha = {
    quantidade: ouZero(linha.quantidade),
    duracao_horas: ouZero(linha.duracao_horas),
    fator_perda: 0,
    distancia_km: numero(linha.distancia_km),
    horas_por_diaria: maquinario.horas_por_diaria,
  };
  const precoCadastro = custoApuradoDoMaquinario(maquinario).preco_base;
  const proprio = numero(linha.preco_proprio);
  const precoBase = proprio === null ? precoCadastro : centavos(proprio);
  const unidades = unidadesDaBase(maquinario.base_calculo, dados);
  return {
    origem: 'maquinario',
    grupo: 'maquinario',
    recurso_id: null,
    maquinario_id: maquinario.id.trim(),
    nome: maquinario.nome,
    categoria: 'maquinario',
    rubrica: maquinario.rubrica,
    base_calculo: maquinario.base_calculo,
    ...dados,
    fornecido_pelo_cliente: false,
    unidades,
    preco_base: precoBase,
    preco_cadastro: precoCadastro,
    preco_proprio: proprio,
    subtotal: subtotalDaBase(maquinario.base_calculo, dados, unidades, precoBase),
  };
}

/**
 * O item como a linha da instrução o mostra: o que a tela e a planilha leem e o
 * preço de uma unidade da cobrança. Não vai o cadastro inteiro: o detalhe da
 * instrução se lê com `manutencao.view` (técnico, cliente), e o investimento, os
 * custos anuais e a amortização por hora do item são do cadastro, que pede
 * `recursos.manage` (revisão de segurança do SN-85).
 */
export function itemDoRecurso(r: recursos) {
  const { preco_base, custo_origem } = custoApurado(r);
  return {
    id: r.id.trim(),
    nome: r.nome,
    categoria: r.categoria,
    unidade: r.unidade,
    base_calculo: r.base_calculo,
    rubrica: r.rubrica,
    horas_por_diaria: r.horas_por_diaria,
    ativo: r.ativo,
    deleted_at: r.deleted_at,
    preco_base,
    custo_origem,
  };
}

export function itemDoMaquinario(m: maquinarios) {
  const { preco_base, custo_origem } = custoApuradoDoMaquinario(m);
  return {
    id: m.id.trim(),
    nome: m.nome,
    tipo: m.tipo,
    base_calculo: m.base_calculo,
    rubrica: m.rubrica,
    horas_por_diaria: m.horas_por_diaria,
    ativo: m.ativo,
    deleted_at: m.deleted_at,
    preco_base,
    custo_origem,
  };
}

/** A soma, com a regra do total: uma linha sem custo deixa a soma nula */
export function somar(linhas: Pick<LinhaDeCusto, 'subtotal'>[]): number | null {
  let total = 0;
  for (const { subtotal } of linhas) {
    if (subtotal === null) return null;
    total += subtotal;
  }
  return centavos(total);
}

/** Recursos, maquinário e materiais, cada um com a regra do total. Grupo sem linha é zero, não nulo */
export function porGrupo(linhas: Pick<LinhaDeCusto, 'grupo' | 'subtotal'>[]): Record<Grupo, number | null> {
  return Object.fromEntries(GRUPOS.map((g) => [g, somar(linhas.filter((l) => l.grupo === g))])) as Record<Grupo, number | null>;
}
