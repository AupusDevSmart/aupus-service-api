import { comDataNecessidadeNormalizada } from './data-necessidade';

describe('comDataNecessidadeNormalizada', () => {
  it('converte ISO com fuso em Date, no mesmo instante', () => {
    const r = comDataNecessidadeNormalizada({ data_necessidade: '2026-09-29T12:00:00.000Z' });
    expect(r.data_necessidade).toEqual(new Date('2026-09-29T12:00:00.000Z'));
  });

  it('aceita a forma curta do datetime-local, que o Prisma recusava', () => {
    const r = comDataNecessidadeNormalizada({ data_necessidade: '2026-09-29T09:00' });
    expect(r.data_necessidade).toBeInstanceOf(Date);
    expect(Number.isNaN((r.data_necessidade as Date).getTime())).toBe(false);
  });

  it('string vazia limpa o campo', () => {
    expect(comDataNecessidadeNormalizada({ data_necessidade: '' }).data_necessidade).toBeNull();
  });

  it('sem o campo, nao inventa nada', () => {
    const dados = { titulo: 'x' };
    expect(comDataNecessidadeNormalizada(dados)).toBe(dados);
  });

  it('preserva os outros campos', () => {
    const r = comDataNecessidadeNormalizada({ titulo: 'x', data_necessidade: '2026-09-29T09:00' });
    expect(r.titulo).toBe('x');
  });
});
