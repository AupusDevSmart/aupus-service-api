import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/** Os nove componentes do BDI, em porcentagem (5 = 5%), como as colunas `bdi_*` */
export const CAMPOS_DO_BDI = [
  'bdi_administracao_central',
  'bdi_seguro_garantia',
  'bdi_taxa_risco',
  'bdi_despesas_financeiras',
  'bdi_lucro',
  'bdi_pis',
  'bdi_cofins',
  'bdi_cprb',
  'bdi_issqn',
] as const;

export type CampoDoBdi = (typeof CAMPOS_DO_BDI)[number];
export type ComponentesDoBdi = Record<CampoDoBdi, number>;

/** A tabela GOINFRA sem REIDI: 30,44%. O padrão de até 28/out/2026, e o da linha que o SQL cria */
export const BDI_GOINFRA: ComponentesDoBdi = {
  bdi_administracao_central: 5,
  bdi_seguro_garantia: 0.5,
  bdi_taxa_risco: 0,
  bdi_despesas_financeiras: 0.5,
  bdi_lucro: 5,
  bdi_pis: 0.65,
  bdi_cofins: 3,
  bdi_cprb: 4.5,
  bdi_issqn: 6.5,
};

/** O teto de `bdi_percentual`, Decimal(6, 3) */
export const TETO_DO_BDI = 999.999;

const numero = (valor: Prisma.Decimal | number | null | undefined): number => {
  if (valor === null || valor === undefined) return 0;
  const n = typeof valor === 'object' ? valor.toNumber() : Number(valor);
  return Number.isFinite(n) ? n : 0;
};

/** Os componentes de uma linha do banco (a solicitação ou o padrão), em número */
export function componentesDe(linha: Partial<Record<CampoDoBdi, Prisma.Decimal | number | null>>): ComponentesDoBdi {
  return Object.fromEntries(CAMPOS_DO_BDI.map((campo) => [campo, numero(linha[campo])])) as ComponentesDoBdi;
}

/** PIS + COFINS + CPRB + ISSQN, em porcentagem: o I da fórmula */
export const impostosDoBdi = (c: ComponentesDoBdi) => c.bdi_pis + c.bdi_cofins + c.bdi_cprb + c.bdi_issqn;

/**
 * O BDI, em fração (0,3044 = 30,44%), pela fórmula do acórdão 2.622/2013 do TCU:
 *
 *   BDI = [ (1+AC+SG+R) × (1+DF) × (1+L) / (1-I) ] - 1
 *
 * Os impostos com 100% ou mais não fecham a conta (a fórmula divide por 1 - I):
 * é 400, e não um BDI zero calado.
 */
export function bdiDaFormula(c: ComponentesDoBdi): number {
  const f = (v: number) => v / 100;
  const i = f(impostosDoBdi(c));
  if (i >= 1) {
    throw new BadRequestException('Os impostos do BDI (PIS, COFINS, CPRB e ISSQN) somam 100% ou mais: a conta do BDI não fecha.');
  }
  return ((1 + f(c.bdi_administracao_central) + f(c.bdi_seguro_garantia) + f(c.bdi_taxa_risco)) *
    (1 + f(c.bdi_despesas_financeiras)) *
    (1 + f(c.bdi_lucro))) /
    (1 - i) - 1;
}

/** O percentual com três casas, como `bdi_percentual` guarda: 30,44% arredondado para 30,4% move dezenas de reais */
export const percentualDoBdi = (bdi: number) => Math.round(bdi * 100 * 1000) / 1000;

/**
 * O BDI padrão da empresa (28/out/2026): o que a solicitação nova copia para os
 * seus `bdi_*`. Sem a linha (apagada à mão), a tabela GOINFRA — o padrão de
 * antes, que as colunas também têm como default. Sem a TABELA é erro: no deploy,
 * o SQL `2026-10-28-bdi-padrao-e-desconto.sql` vai antes de a API nova subir.
 */
export async function bdiPadrao(prisma: Pick<Prisma.TransactionClient, 'bdi_padrao'>): Promise<ComponentesDoBdi> {
  const linha = await prisma.bdi_padrao.findUnique({ where: { id: 1 } });
  return linha ? componentesDe(linha) : { ...BDI_GOINFRA };
}
