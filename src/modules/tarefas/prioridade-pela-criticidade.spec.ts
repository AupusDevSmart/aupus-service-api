import { nivelDeCriticidade, prioridadePelaCriticidade } from './prioridade-pela-criticidade';

describe('nivelDeCriticidade', () => {
  it('lê a escala de hoje (1 a 5), em texto ou número', () => {
    expect(nivelDeCriticidade('5')).toBe(5);
    expect(nivelDeCriticidade(4)).toBe(4);
    expect(nivelDeCriticidade(' 1 ')).toBe(1);
  });

  it('lê a escala antiga A/B/C (A é a mais crítica)', () => {
    expect(nivelDeCriticidade('A')).toBe(5);
    expect(nivelDeCriticidade('b')).toBe(3);
    expect(nivelDeCriticidade('C')).toBe(1);
  });

  it('valor vazio ou desconhecido não conta', () => {
    expect(nivelDeCriticidade(null)).toBeNull();
    expect(nivelDeCriticidade('')).toBeNull();
    expect(nivelDeCriticidade('X')).toBeNull();
    expect(nivelDeCriticidade(9)).toBeNull();
  });
});

describe('prioridadePelaCriticidade', () => {
  it('a maior criticidade do grupo decide: 4 e 5 são ALTA, 3 é MEDIA, 1 e 2 são BAIXA', () => {
    expect(prioridadePelaCriticidade(['5'])).toBe('ALTA');
    expect(prioridadePelaCriticidade(['4', '1'])).toBe('ALTA');
    expect(prioridadePelaCriticidade(['3', '2'])).toBe('MEDIA');
    expect(prioridadePelaCriticidade(['2', 1])).toBe('BAIXA');
  });

  it('preventiva nunca nasce CRITICA: essa fica para corretiva e anomalia', () => {
    expect(prioridadePelaCriticidade(['5', 5, 'A'])).not.toBe('CRITICA');
  });

  it('sem criticidade nenhuma, MEDIA', () => {
    expect(prioridadePelaCriticidade([null, undefined, ''])).toBe('MEDIA');
  });

  it('o dado antigo A/B/C segue funcionando', () => {
    expect(prioridadePelaCriticidade(['A'])).toBe('ALTA');
    expect(prioridadePelaCriticidade(['C'])).toBe('BAIXA');
  });
});
