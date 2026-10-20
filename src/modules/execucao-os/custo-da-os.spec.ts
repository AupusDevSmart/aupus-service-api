import { Prisma } from '@prisma/client';
import { custoDasLinhas, reais } from './custo-da-os';

/** A conta do custo real e do custo por natureza do painel (SN-61, SN-81). */
describe('custoDasLinhas', () => {
  const d = (v: number | null) => (v === null ? null : new Prisma.Decimal(v));
  const material = (custo_unitario: number | null, quantidade_consumida: number | null) => ({
    custo_unitario: d(custo_unitario),
    quantidade_consumida: d(quantidade_consumida),
  });
  const tecnico = (custo_hora: number | null, horas_trabalhadas: number | null, horas_estimadas = 8) => ({
    custo_hora: d(custo_hora),
    horas_trabalhadas: d(horas_trabalhadas),
    horas_estimadas: new Prisma.Decimal(horas_estimadas),
  });

  it('material pelo consumido; mão de obra pelas horas trabalhadas', () => {
    const custo = custoDasLinhas([material(10, 3), material(2.5, 4)], [tecnico(80, 2.5), tecnico(60, 1)]);
    expect([custo.material.toNumber(), custo.maoDeObra.toNumber()]).toEqual([40, 260]);
  });

  it('o material planejado e não consumido não custa; sem custo unitário, também não', () => {
    const custo = custoDasLinhas([material(10, null), material(null, 5)], []);
    expect(custo.material.toNumber()).toBe(0);
  });

  it('sem horas registradas (OS anterior ao SN-61), vale a estimada; sem custo/hora, não custa', () => {
    const custo = custoDasLinhas([], [tecnico(50, null, 4), tecnico(null, 3)]);
    expect(custo.maoDeObra.toNumber()).toBe(200);
  });

  // Em float, 0,5 h x R$ 2,01 dava 1,00 na linha e 1,01 no custo da OS
  it('cada linha em centavos, metade para cima, antes de somar', () => {
    const custo = custoDasLinhas([], [tecnico(2.01, 0.5), tecnico(2.01, 0.5)]);
    expect(custo.maoDeObra.toNumber()).toBe(2.02);
  });
});

describe('reais', () => {
  it('vírgula nos centavos e ponto no milhar; nulo é zero', () => {
    expect([reais(new Prisma.Decimal(1234567.5)), reais(new Prisma.Decimal(25)), reais(null)]).toEqual(['1.234.567,50', '25,00', '0,00']);
  });
});
