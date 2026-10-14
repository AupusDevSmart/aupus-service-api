import { SEMANA_PADRAO, diaEmBrasilia, ehDiaUtil, feriadoDoDia, proximoDiaUtil, type RegraDeDiasUteis } from './dias-uteis';

/** Feriado como o banco guarda (@db.Date): meia-noite UTC do dia. */
const feriado = (iso: string, recorrente = false, nome = 'Feriado') => ({ data: new Date(`${iso}T00:00:00.000Z`), recorrente, nome });
const regra = (dados: Partial<RegraDeDiasUteis> = {}): RegraDeDiasUteis => ({ diasDaSemana: SEMANA_PADRAO, feriados: [], ...dados });

// Outubro de 2026: dia 17 é sábado, 18 domingo, 19 segunda.
describe('diaEmBrasilia', () => {
  it('é o dia de Brasília, não o do servidor: 01:00 UTC ainda é a noite anterior', () => {
    expect(diaEmBrasilia(new Date('2026-10-18T01:00:00Z'))).toEqual({ ano: 2026, mes: 10, dia: 17, diaDaSemana: 6 });
    expect(diaEmBrasilia(new Date('2026-10-18T03:00:00Z'))).toEqual({ ano: 2026, mes: 10, dia: 18, diaDaSemana: 0 });
  });
});

describe('feriadoDoDia', () => {
  it('feriado de um ano só vale naquele ano; o recorrente vale todo ano', () => {
    const dia = diaEmBrasilia(new Date('2027-12-25T15:00:00Z'));
    expect(feriadoDoDia(dia, [feriado('2026-12-25')])).toBeUndefined();
    expect(feriadoDoDia(dia, [feriado('2026-12-25', true, 'Natal')])?.nome).toBe('Natal');
  });
});

describe('ehDiaUtil', () => {
  it('sem configuração, segunda a sexta', () => {
    expect(ehDiaUtil(new Date('2026-10-19T15:00:00Z'), regra())).toBe(true);
    expect(ehDiaUtil(new Date('2026-10-18T15:00:00Z'), regra())).toBe(false);
  });

  it('a semana configurada da planta manda (sábado útil)', () => {
    const comSabado = regra({ diasDaSemana: [false, true, true, true, true, true, true] });
    expect(ehDiaUtil(new Date('2026-10-17T15:00:00Z'), comSabado)).toBe(true);
  });

  it('feriado não é útil, mesmo numa segunda', () => {
    expect(ehDiaUtil(new Date('2026-10-19T15:00:00Z'), regra({ feriados: [feriado('2026-10-19')] }))).toBe(false);
  });
});

describe('proximoDiaUtil', () => {
  it('domingo vai para segunda, mantendo a hora', () => {
    expect(proximoDiaUtil(new Date('2026-10-18T13:30:00Z'), regra()).toISOString()).toBe('2026-10-19T13:30:00.000Z');
  });

  it('sábado à noite em Brasília (já domingo em UTC) também vai para segunda', () => {
    expect(proximoDiaUtil(new Date('2026-10-18T01:00:00Z'), regra()).toISOString()).toBe('2026-10-20T01:00:00.000Z');
  });

  it('segunda feriado empurra para terça', () => {
    const r = regra({ feriados: [feriado('2026-10-19')] });
    expect(proximoDiaUtil(new Date('2026-10-18T13:00:00Z'), r).toISOString()).toBe('2026-10-20T13:00:00.000Z');
  });

  it('dia útil fica como está', () => {
    const quarta = new Date('2026-10-14T12:00:00Z');
    expect(proximoDiaUtil(quarta, regra()).getTime()).toBe(quarta.getTime());
  });

  it('semana sem nenhum dia útil não trava: devolve a data pedida', () => {
    const nenhum = regra({ diasDaSemana: [false, false, false, false, false, false, false] });
    const data = new Date('2026-10-14T12:00:00Z');
    expect(proximoDiaUtil(data, nenhum).getTime()).toBe(data.getTime());
  });
});
