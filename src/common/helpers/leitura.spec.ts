import { Prisma } from '@prisma/client';
import { descreverFaixa, foraDaFaixa } from './leitura';

describe('leitura (SN-58)', () => {
  it.each([
    [600, 580, 620, false],
    [580, 580, 620, false], // o limite faz parte da faixa
    [620, 580, 620, false],
    [579.9999, 580, 620, true],
    [620.0001, 580, 620, true],
    [-5, null, 0, false],
    [5, null, 0, true],
    [1000, 1, null, false],
    [0.5, 1, null, true],
    [12, null, null, false],
    [null, 580, 620, false], // sem valor não está fora: falta ler
  ])('%s na faixa [%s, %s] -> fora: %s', (valor, minimo, maximo, fora) => {
    expect(foraDaFaixa(valor, { valor_minimo: minimo, valor_maximo: maximo })).toBe(fora);
  });

  it('o Decimal do banco conta igual ao número', () => {
    expect(foraDaFaixa(new Prisma.Decimal('70.5000'), { valor_maximo: new Prisma.Decimal('70.5') })).toBe(false);
    expect(foraDaFaixa(new Prisma.Decimal('70.5001'), { valor_maximo: new Prisma.Decimal('70.5') })).toBe(true);
  });

  it.each([
    [{ valor_minimo: 580, valor_maximo: 620, unidade: 'V' }, '580 a 620 V'],
    [{ valor_minimo: 1.5, unidade: 'MΩ' }, 'no mínimo 1,5 MΩ'],
    [{ valor_maximo: 70.5, unidade: ' °C ' }, 'no máximo 70,5 °C'],
    [{ valor_minimo: 0, valor_maximo: 10 }, '0 a 10'],
    [{ unidade: 'h' }, ''],
  ])('descreve %j como "%s"', (faixa, texto) => {
    expect(descreverFaixa(faixa)).toBe(texto);
  });
});
