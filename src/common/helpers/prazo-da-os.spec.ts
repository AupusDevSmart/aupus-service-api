import { passouDoPrazo, prazoDaOrdem, terminouNoPrazo } from './prazo-da-os';

/**
 * O prazo da OS no painel. Antes o fim era comparado com a hora de COMEÇAR:
 * "0% no prazo" com 162 OS concluídas, e a aberta atrasada assim que começava.
 */
const as8 = new Date('2026-10-20T08:00:00-03:00');

describe('prazoDaOrdem', () => {
  it('o fim do dia programado, em Brasília', () => {
    expect(prazoDaOrdem({ data_hora_programada: as8, duracao_estimada: 2 })).toEqual(new Date('2026-10-20T23:59:59-03:00'));
  });

  it('a OS que passa do dia vale pelo término previsto', () => {
    const as20 = new Date('2026-10-20T20:00:00-03:00');
    expect(prazoDaOrdem({ data_hora_programada: as20, duracao_estimada: 10 })).toEqual(new Date('2026-10-21T06:00:00-03:00'));
  });

  it('programada às 23h em Brasília (2h UTC do dia seguinte): o dia é o de Brasília', () => {
    const as23 = new Date('2026-10-20T23:00:00-03:00');
    expect(prazoDaOrdem({ data_hora_programada: as23, duracao_estimada: 0.5 })).toEqual(new Date('2026-10-20T23:59:59-03:00'));
  });

  it('sem data programada não há prazo; duração vazia ou inválida vale zero', () => {
    expect(prazoDaOrdem({ data_hora_programada: null, duracao_estimada: 2 })).toBeNull();
    expect(prazoDaOrdem({ data_hora_programada: as8, duracao_estimada: null })).toEqual(new Date('2026-10-20T23:59:59-03:00'));
    expect(prazoDaOrdem({ data_hora_programada: as8, duracao_estimada: Number.NaN })).toEqual(new Date('2026-10-20T23:59:59-03:00'));
  });
});

describe('terminouNoPrazo', () => {
  const os = { data_hora_programada: as8, duracao_estimada: 2 };

  it('terminou depois de começar, no mesmo dia: no prazo (era fora)', () => {
    expect(terminouNoPrazo(os, new Date('2026-10-20T11:30:00-03:00'))).toBe(true);
  });

  it('terminou no dia seguinte: fora do prazo', () => {
    expect(terminouNoPrazo(os, new Date('2026-10-21T09:00:00-03:00'))).toBe(false);
  });

  it('sem fim ou sem data programada, não conta como no prazo', () => {
    expect(terminouNoPrazo(os, null)).toBe(false);
    expect(terminouNoPrazo({ data_hora_programada: null }, new Date('2026-10-20T09:00:00-03:00'))).toBe(false);
  });
});

describe('passouDoPrazo', () => {
  const os = { data_hora_programada: as8, duracao_estimada: 2 };

  it('em execução no dia programado: ainda não atrasada (era atrasada desde as 8h01)', () => {
    expect(passouDoPrazo(os, new Date('2026-10-20T15:00:00-03:00'))).toBe(false);
  });

  it('o dia programado acabou: atrasada', () => {
    expect(passouDoPrazo(os, new Date('2026-10-21T00:00:01-03:00'))).toBe(true);
  });

  it('sem data programada não fica atrasada', () => {
    expect(passouDoPrazo({ data_hora_programada: null }, new Date('2030-01-01T00:00:00Z'))).toBe(false);
  });
});
