import { Prisma } from '@prisma/client';
import { reais } from './custo-da-os';

// A conta do custo (mão de obra, material, outros custos) está em `resumo-do-custo.spec.ts` (SN-93)
describe('reais', () => {
  it('vírgula nos centavos e ponto no milhar; nulo é zero', () => {
    expect([reais(new Prisma.Decimal(1234567.5)), reais(new Prisma.Decimal(25)), reais(null)]).toEqual(['1.234.567,50', '25,00', '0,00']);
  });
});
