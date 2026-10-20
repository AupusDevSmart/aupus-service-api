import { Prisma, type materiais_os, type tecnicos_os } from '@prisma/client';
import { emCentavos } from './horas-da-execucao';

/** Valor em reais com vírgula, para a trilha da OS ("1.234,50") */
export const reais = (valor: Prisma.Decimal | null) => {
  const [inteiro, centavos] = (valor ?? new Prisma.Decimal(0)).toFixed(2).split('.');
  return `${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${centavos}`;
};

/** O custo real da OS, separado por natureza. */
export interface CustoDasLinhas {
  maoDeObra: Prisma.Decimal;
  material: Prisma.Decimal;
}

/**
 * O custo da OS pelas linhas: material realmente consumido e mão de obra pelas
 * horas registradas (a estimada só na OS executada antes do SN-61, sem horas).
 * Em Decimal, cada parcela arredondada como o custo da linha (SN-61): em float,
 * 0,5 h x R$ 2,01 gravava 1,00 na linha e 1,01 no custo da OS.
 *
 * Uma conta só para o `custo_real` gravado e para o custo por natureza do
 * painel (SN-81): duas contas acabariam divergindo.
 */
export function custoDasLinhas(
  materiais: Pick<materiais_os, 'custo_unitario' | 'quantidade_consumida'>[],
  tecnicos: Pick<tecnicos_os, 'custo_hora' | 'horas_trabalhadas' | 'horas_estimadas'>[],
): CustoDasLinhas {
  let material = new Prisma.Decimal(0);
  for (const m of materiais) {
    if (m.custo_unitario && m.quantidade_consumida) {
      material = material.add(emCentavos(m.custo_unitario.mul(m.quantidade_consumida)));
    }
  }

  let maoDeObra = new Prisma.Decimal(0);
  for (const t of tecnicos) {
    if (t.custo_hora) {
      maoDeObra = maoDeObra.add(emCentavos(t.custo_hora.mul(t.horas_trabalhadas ?? t.horas_estimadas)));
    }
  }

  return { maoDeObra, material };
}
