/** Como o desconto da proposta é dado: um percentual ou um valor em reais */
export const TIPOS_DE_DESCONTO = ['PERCENTUAL', 'VALOR'] as const;
export type TipoDeDesconto = (typeof TIPOS_DE_DESCONTO)[number];
