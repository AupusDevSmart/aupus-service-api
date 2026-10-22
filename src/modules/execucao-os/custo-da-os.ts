import { Prisma } from '@prisma/client';

/** Valor em reais com vírgula, para a trilha da OS ("1.234,50") */
export const reais = (valor: Prisma.Decimal | null) => {
  const [inteiro, centavos] = (valor ?? new Prisma.Decimal(0)).toFixed(2).split('.');
  return `${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${centavos}`;
};

// A conta do custo da OS (o custo real gravado, o painel, o sheet e o PDF) é uma
// só, desde o SN-93: `resumo-do-custo.ts`. A daqui (`custoDasLinhas`, mão de obra
// e material) saiu junto, para não haver duas contas que acabariam divergindo.
