import {
  avisoDaPeriodicidade,
  calcularProximaExecucao,
  calcularProximaExecucaoPorDias,
  ciclosEquivalentes,
  periodicidadePorCalendario,
  somarCiclos,
  somarMeses,
} from './periodicidade';

/** Brasília, -03:00 fixo, como a tela e a regra de dias úteis. */
const br = (diaHora: string) => new Date(`${diaHora}-03:00`);

/**
 * A periodicidade por calendário (SN-54): o mensal vence no mesmo dia do mês,
 * ou no último quando o mês é mais curto. Desligada (o padrão até o deploy),
 * tudo segue em dias fixos.
 */
describe('periodicidade', () => {
  afterEach(() => {
    delete process.env.PERIODICIDADE_POR_CALENDARIO;
  });

  describe('somarMeses (relógio de Brasília)', () => {
    it.each([
      ['2026-01-31T00:00:00', 1, '2026-02-28T00:00:00'],
      ['2026-03-31T00:00:00', 1, '2026-04-30T00:00:00'],
      ['2024-02-29T00:00:00', 12, '2025-02-28T00:00:00'],
      ['2026-01-10T08:00:00', 6, '2026-07-10T08:00:00'],
      ['2026-05-15T00:00:00', -1, '2026-04-15T00:00:00'],
    ])('%s + %i mês(es) = %s', (de, meses, para) => {
      expect(somarMeses(br(de), meses)).toEqual(br(para));
    });

    // 23:30 de 31/01 em Brasília é 01/02 no UTC: pelo UTC, iria a 01/03
    it('a hora da noite fica no dia de Brasília', () => {
      expect(somarMeses(br('2026-01-31T23:30:00'), 1)).toEqual(br('2026-02-28T23:30:00'));
    });
  });

  describe('calcularProximaExecucao', () => {
    const mensal = { frequencia: 'MENSAL', data_ancora: br('2026-01-31T00:00:00') };

    it('desligada (o padrão): dias fixos, como sempre', () => {
      expect(calcularProximaExecucao(mensal)).toEqual(br('2026-03-02T00:00:00'));
    });

    it('ligada: o mesmo dia do mês, ou o último do mês mais curto', () => {
      process.env.PERIODICIDADE_POR_CALENDARIO = 'on';

      expect(calcularProximaExecucao(mensal)).toEqual(br('2026-02-28T00:00:00'));
      expect(calcularProximaExecucao({ frequencia: 'ANUAL', data_ancora: br('2024-02-29T00:00:00') })).toEqual(br('2025-02-28T00:00:00'));
      expect(calcularProximaExecucao({ frequencia: 'TRIMESTRAL', data_ancora: br('2026-01-10T00:00:00') })).toEqual(br('2026-04-10T00:00:00'));
    });

    it('ligada: as frequências em dias (diária, semanal, quinzenal, personalizada) não mudam', () => {
      process.env.PERIODICIDADE_POR_CALENDARIO = 'on';
      const ancora = br('2026-01-31T00:00:00');

      expect(calcularProximaExecucao({ frequencia: 'SEMANAL', data_ancora: ancora })).toEqual(br('2026-02-07T00:00:00'));
      expect(calcularProximaExecucao({ frequencia: 'QUINZENAL', data_ancora: ancora })).toEqual(br('2026-02-15T00:00:00'));
      expect(calcularProximaExecucao({ frequencia: 'PERSONALIZADA', frequencia_personalizada: 45, data_ancora: ancora })).toEqual(br('2026-03-17T00:00:00'));
    });

    it('a base continua a mais recente entre a execução real e a âncora', () => {
      process.env.PERIODICIDADE_POR_CALENDARIO = 'on';

      expect(calcularProximaExecucao(mensal, br('2026-02-10T14:00:00'))).toEqual(br('2026-03-10T14:00:00'));
    });

    it('a conta por dias fica disponível ligada (casa o ciclo das programações abertas antes da troca)', () => {
      process.env.PERIODICIDADE_POR_CALENDARIO = 'on';

      expect(calcularProximaExecucaoPorDias(mensal)).toEqual(br('2026-03-02T00:00:00'));
    });
  });

  describe('a variável', () => {
    it.each([['on'], ['ON'], [' on ']])('"%s" liga', (valor) => {
      process.env.PERIODICIDADE_POR_CALENDARIO = valor;
      expect(periodicidadePorCalendario()).toBe(true);
      expect(avisoDaPeriodicidade()).toBeNull();
    });

    it('valor que não liga nem desliga segue em dias, e avisa (seguiria calado)', () => {
      process.env.PERIODICIDADE_POR_CALENDARIO = 'true';
      expect(periodicidadePorCalendario()).toBe(false);
      expect(avisoDaPeriodicidade()).toContain('não é "on"');
    });

    it('vazia ou "off" não avisa', () => {
      expect(avisoDaPeriodicidade()).toBeNull();
      process.env.PERIODICIDADE_POR_CALENDARIO = 'off';
      expect(avisoDaPeriodicidade()).toBeNull();
    });
  });

  it('o ciclo equivalente vem pelas duas contas, qualquer que seja a ligada', () => {
    const mensal = { frequencia: 'MENSAL', data_ancora: br('2026-01-31T00:00:00') };
    const esperado = [br('2026-03-02T00:00:00'), br('2026-02-28T00:00:00')];

    expect(ciclosEquivalentes(mensal)).toEqual(esperado);
    process.env.PERIODICIDADE_POR_CALENDARIO = 'on';
    expect(ciclosEquivalentes(mensal)).toEqual(esperado);
  });

  it('somarCiclos anda e volta pela regra da frequência', () => {
    const mensal = { frequencia: 'MENSAL' };
    expect(somarCiclos(mensal, br('2026-01-31T00:00:00'), 2, true)).toEqual(br('2026-03-31T00:00:00'));
    expect(somarCiclos(mensal, br('2026-03-31T00:00:00'), -1, true)).toEqual(br('2026-02-28T00:00:00'));
    expect(somarCiclos(mensal, br('2026-01-31T00:00:00'), 2, false)).toEqual(br('2026-04-01T00:00:00'));
    expect(somarCiclos({ frequencia: null }, br('2026-01-31T00:00:00'), 1, true)).toBeNull();
  });
});
