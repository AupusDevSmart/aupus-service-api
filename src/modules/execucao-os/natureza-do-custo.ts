/**
 * As naturezas do custo da OS (SN-93). Mão de obra e material saem das linhas
 * de técnico e de material; as outras são os "outros custos" (os itens de
 * orçamento), com as categorias do recurso que os gerou: instrumento, veículo,
 * terceiro e despesa de campo, mais o maquinário. O que não cabe em nenhuma é
 * OUTRO (o lançado à mão sem natureza).
 */
export const NATUREZAS_DOS_OUTROS_CUSTOS = ['INSTRUMENTO', 'MAQUINARIO', 'VEICULO', 'TERCEIRO', 'DESPESA_CAMPO', 'OUTRO'] as const;
export type NaturezaDoOutroCusto = (typeof NATUREZAS_DOS_OUTROS_CUSTOS)[number];

export type NaturezaDoCusto = 'MAO_DE_OBRA' | 'MATERIAL' | NaturezaDoOutroCusto;

export const ROTULO_DA_NATUREZA: Record<NaturezaDoCusto, string> = {
  MAO_DE_OBRA: 'Mão de obra',
  MATERIAL: 'Material',
  INSTRUMENTO: 'Instrumentos',
  MAQUINARIO: 'Maquinário',
  VEICULO: 'Veículo',
  TERCEIRO: 'Terceiros',
  DESPESA_CAMPO: 'Despesas de campo',
  OUTRO: 'Outros',
};

/** A natureza de UM item ("Instrumento · previsto R$ 160,00"); a de cima é a da soma, no plural */
export const ROTULO_DO_ITEM: Record<NaturezaDoOutroCusto, string> = {
  INSTRUMENTO: 'Instrumento',
  MAQUINARIO: 'Maquinário',
  VEICULO: 'Veículo',
  TERCEIRO: 'Terceiro',
  DESPESA_CAMPO: 'Despesa de campo',
  OUTRO: 'Outro',
};

/**
 * O prefixo que a tela grava na descrição do item que veio da instrução
 * ("Veículo: Picape 4x4", `recursos-das-instrucoes.ts`). É a natureza do item que
 * chega sem ela (a tela de antes do SN-93), a mesma regra do SQL que preencheu os
 * itens que já existiam.
 */
const PREFIXOS: [string, NaturezaDoOutroCusto][] = [
  ['Instrumento:', 'INSTRUMENTO'],
  ['Maquinário:', 'MAQUINARIO'],
  ['Veículo:', 'VEICULO'],
  ['Terceiro:', 'TERCEIRO'],
  ['Despesa de campo:', 'DESPESA_CAMPO'],
];

export function naturezaPeloPrefixo(descricao: string | null | undefined): NaturezaDoOutroCusto {
  const texto = descricao ?? '';
  return PREFIXOS.find(([prefixo]) => texto.startsWith(prefixo))?.[1] ?? 'OUTRO';
}

export const ehNaturezaDeOutroCusto = (valor: unknown): valor is NaturezaDoOutroCusto =>
  typeof valor === 'string' && (NATUREZAS_DOS_OUTROS_CUSTOS as readonly string[]).includes(valor);

/** A natureza gravada, como o tipo (o banco a confere: o que não for dela é OUTRO) */
export const naturezaDoItem = (valor: string | null | undefined): NaturezaDoOutroCusto =>
  ehNaturezaDeOutroCusto(valor) ? valor : 'OUTRO';
