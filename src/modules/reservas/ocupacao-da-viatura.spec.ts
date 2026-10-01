import { diaDe, formatarMomento, intervaloDaReserva, sobrepoe } from './ocupacao-da-viatura';

/**
 * A regra de ocupação da viatura (docs/SPEC-RESERVAS-DE-VIATURA.md §4.1).
 *
 * A reserva guarda o dia (timestamp de meia-noite UTC) e a hora em texto
 * ("HH:mm", hora de Brasília). Antes a checagem comparava só os dias e a tela
 * concatenava um ISO com a hora — data inválida, e nenhuma viatura aparecia
 * ocupada.
 */
describe('ocupação da viatura', () => {
  const dia = (d: string) => new Date(`${d}T00:00:00.000Z`);

  it('monta o intervalo com o dia gravado e a hora de Brasília', () => {
    const { inicio, fim } = intervaloDaReserva({
      data_inicio: dia('2027-03-10'),
      data_fim: dia('2027-03-10'),
      hora_inicio: '08:00',
      hora_fim: '12:00',
    });

    expect(inicio.toISOString()).toBe('2027-03-10T11:00:00.000Z');
    expect(fim.toISOString()).toBe('2027-03-10T15:00:00.000Z');
  });

  it('sem hora (ou 23:59) ocupa o dia inteiro, até a meia-noite seguinte', () => {
    const semHora = intervaloDaReserva({ data_inicio: dia('2027-03-10'), data_fim: dia('2027-03-11') });
    const ateFimDoDia = intervaloDaReserva({
      data_inicio: dia('2027-03-10'),
      data_fim: dia('2027-03-10'),
      hora_inicio: '00:00',
      hora_fim: '23:59',
    });

    expect(semHora.inicio.toISOString()).toBe('2027-03-10T03:00:00.000Z');
    expect(semHora.fim.toISOString()).toBe('2027-03-12T03:00:00.000Z');
    expect(ateFimDoDia.fim.toISOString()).toBe('2027-03-11T03:00:00.000Z');
  });

  it('horários encostados não conflitam; sobrepostos conflitam', () => {
    const manha = intervaloDaReserva({ data_inicio: dia('2027-03-10'), data_fim: dia('2027-03-10'), hora_inicio: '08:00', hora_fim: '12:00' });
    const tarde = intervaloDaReserva({ data_inicio: dia('2027-03-10'), data_fim: dia('2027-03-10'), hora_inicio: '12:00', hora_fim: '18:00' });
    const almoco = intervaloDaReserva({ data_inicio: dia('2027-03-10'), data_fim: dia('2027-03-10'), hora_inicio: '11:00', hora_fim: '13:00' });

    expect(sobrepoe(manha, tarde)).toBe(false);
    expect(sobrepoe(manha, almoco)).toBe(true);
    expect(sobrepoe(tarde, almoco)).toBe(true);
  });

  it('dia de um instante real é o dia em Brasília; de meia-noite UTC é o dia gravado', () => {
    // 23:30 de 05/10 em Brasília = 02:30Z do dia 06
    expect(diaDe(new Date('2027-10-06T02:30:00.000Z'))).toBe('2027-10-05');
    expect(diaDe(dia('2027-10-06'))).toBe('2027-10-06');
    expect(diaDe('2027-10-06')).toBe('2027-10-06');
  });

  it('formata o momento em Brasília', () => {
    expect(formatarMomento(new Date('2027-03-10T11:00:00.000Z'))).toBe('10/03 08:00');
  });
});
