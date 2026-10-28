/** Como o desconto da proposta é dado: um percentual ou um valor em reais */
export const TIPOS_DE_DESCONTO = ['PERCENTUAL', 'VALOR'] as const;
export type TipoDeDesconto = (typeof TIPOS_DE_DESCONTO)[number];

const centavos = (valor: number) => Math.round(valor * 100) / 100;

export interface DescontoDaProposta {
  /** Os reais que o desconto pede */
  pedido: number;
  /** Os reais descontados: o pedido, até o total (a proposta não fica negativa) */
  aplicado: number;
}

/**
 * O desconto da proposta (28/out/2026), sobre o total inteiro — o faturamento
 * direto junto, por decisão do usuário. Evita ajustar o valor de cada instrução
 * para dar um desconto no fechamento.
 *
 * O valor em reais maior que o total é recusado ao ser gravado (`salvarCondicoes`);
 * se depois o total cai abaixo dele (uma instrução desvinculada), o aplicado para
 * no total e a tela mostra o aplicado — nada fica negativo nem some calado.
 */
export function descontoDaProposta(
  tipo: string | null | undefined,
  valor: number | null | undefined,
  total: number,
): DescontoDaProposta {
  if (!tipo || !valor || valor <= 0) return { pedido: 0, aplicado: 0 };
  const pedido = tipo === 'PERCENTUAL' ? centavos((Math.max(total, 0) * valor) / 100) : centavos(valor);
  return { pedido, aplicado: Math.min(pedido, Math.max(total, 0)) };
}
