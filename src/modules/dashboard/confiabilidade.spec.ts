import { calcularConfiabilidade, type OrdemDaConfiabilidade } from './confiabilidade';

/**
 * MTBF, MTTR e disponibilidade com números conhecidos (SN-80). Falha =
 * corretiva que parou o equipamento, no período em que parou; disponibilidade
 * pelo calendário, 24 h, sobre as horas da frota.
 */
describe('calcularConfiabilidade', () => {
  const H = 3_600_000;
  const desde = new Date('2026-09-01T03:00:00Z');
  const ate = new Date(desde.getTime() + 720 * H); // 30 dias
  const depois = new Date(ate.getTime() + 24 * H);
  const em = (horas: number) => new Date(desde.getTime() + horas * H);
  const frota = (equipamentos: number, horas = equipamentos * 720) => ({ equipamentos, horas });

  let n = 0;
  const os = (dados: Partial<OrdemDaConfiabilidade>): OrdemDaConfiabilidade => {
    n += 1;
    return { id: `os${n}`, tipo: 'CORRETIVA', equipamento_parou: null, parada_inicio: null, parada_fim: null, fim: em(500), equipamentos: [`eq${n}`], ...dados };
  };
  const parou = (de: number, ate_: number, dados: Partial<OrdemDaConfiabilidade> = {}) =>
    os({ equipamento_parou: true, parada_inicio: em(de), parada_fim: em(ate_), ...dados });

  const ordens: OrdemDaConfiabilidade[] = [
    parou(100, 110), // 10 h dentro do período
    parou(700, 730, { fim: em(740) }), // parou no período e a OS terminou depois: 30 h, 20 h dentro
    os({ equipamento_parou: true }), // parou sem horário
    os({ equipamento_parou: false }), // não parou
    os({}), // sem os dados de falha (antes do SN-60)
  ];

  it('a base: corretivas do período, falhas, com e sem horário, sem dados de falha', () => {
    expect(calcularConfiabilidade(ordens, frota(2), { desde, ate }, depois)).toMatchObject({
      corretivas: 5,
      falhas: 3,
      comHorario: 2,
      semHorario: 1,
      semDadosDeFalha: 1,
      equipamentos: 2,
      horasDaFrota: 1440,
    });
  });

  it('MTTR pela duração inteira; horas paradas só a parte dentro do período', () => {
    const conf = calcularConfiabilidade(ordens, frota(2), { desde, ate }, depois);
    expect(conf.mttr).toBe(20); // (10 + 30) / 2
    expect(conf.horasParadas).toBe(30); // 10 + 20
  });

  it('MTBF e disponibilidade pelas horas da frota', () => {
    const conf = calcularConfiabilidade(ordens, frota(2), { desde, ate }, depois);
    expect(conf.mtbf).toBeCloseTo((1440 - 30) / 3, 6);
    expect(conf.disponibilidade).toBeCloseTo((1440 - 30) / 1440, 6);
  });

  // A falha é do período em que parou: pela conclusão, a de setembro executada em outubro sumia dos dois
  it('a corretiva que parou antes do período e terminou dentro dele não é falha deste período, mas a parte dentro desconta', () => {
    const conf = calcularConfiabilidade([parou(-24, 6, { fim: em(10) })], frota(1), { desde, ate }, depois);
    expect([conf.corretivas, conf.falhas, conf.horasParadas]).toEqual([0, 0, 6]);
  });

  it('a mesma hora do mesmo equipamento conta uma vez; equipamentos diferentes somam', () => {
    const mesma = [parou(10, 20, { equipamentos: ['A'] }), parou(15, 25, { equipamentos: ['A'] }), parou(10, 20, { equipamentos: ['B'] })];
    expect(calcularConfiabilidade(mesma, frota(2), { desde, ate }, depois).horasParadas).toBe(25); // A: 10-25 (15 h) + B: 10 h
  });

  it('a preventiva que parou desconta a disponibilidade, mas não é falha nem entra no MTTR', () => {
    const conf = calcularConfiabilidade([parou(10, 18, { tipo: 'PREVENTIVA' })], frota(1), { desde, ate }, depois);
    expect([conf.falhas, conf.mttr, conf.horasParadas, conf.horasParadasNaoProgramadas]).toEqual([0, null, 8, 0]);
    expect(conf.disponibilidade).toBeCloseTo((720 - 8) / 720, 6);
  });

  it('o período em andamento conta até agora', () => {
    const conf = calcularConfiabilidade([parou(10, 20)], frota(1, 240), { desde, ate }, em(240));
    expect(conf.disponibilidade).toBeCloseTo((240 - 10) / 240, 6);
  });

  it('sem falha não há MTBF; sem parada com horário não há MTTR; sem frota não há disponibilidade', () => {
    expect(calcularConfiabilidade([os({ equipamento_parou: false })], frota(3), { desde, ate }, depois)).toMatchObject({ mtbf: null, mttr: null, disponibilidade: 1 });
    expect(calcularConfiabilidade([os({ equipamento_parou: true })], frota(0, 0), { desde, ate }, depois)).toMatchObject({
      falhas: 1,
      mtbf: null,
      mttr: null,
      disponibilidade: null,
    });
  });
});
