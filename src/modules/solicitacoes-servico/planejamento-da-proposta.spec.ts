import { PADROES_DA_LOGISTICA, linhasAutomaticas, planejamentoCalculado, planoDaSincronizacao, type PadroesDaLogistica, type PlanejamentoDigitado } from './planejamento-da-proposta';

/**
 * A logística automática (30/out/2026), com os valores do usuário: km R$ 2,50,
 * 1h30 a cada 100 km, café R$ 10, almoço R$ 20, jantar R$ 20, pernoite R$ 100,
 * 1 veículo a cada 4 pessoas, bate-volta até 2 h de ida, interno = 10% da ida e
 * volta, 2 pessoas quando a proposta não diz.
 */
const vazio: PlanejamentoDigitado = { idaKm: null, internoKm: null, dias: null, pessoas: null, noites: null, horasDosPassos: 0 };
const calcular = (d: Partial<PlanejamentoDigitado>, p: PadroesDaLogistica = PADROES_DA_LOGISTICA) => planejamentoCalculado({ ...vazio, ...d }, p);
const porChave = (d: Partial<PlanejamentoDigitado>, p: PadroesDaLogistica = PADROES_DA_LOGISTICA) =>
  Object.fromEntries(linhasAutomaticas(calcular(d, p), p).map((l) => [l.chave, l]));
const semPessoasPadrao = { ...PADROES_DA_LOGISTICA, pessoasPadrao: 0 };

describe('planejamento calculado', () => {
  it('longe (300 km): pernoite, a viagem soma às horas, o interno é 10% da ida e volta, 2 veículos para 5 pessoas', () => {
    expect(calcular({ idaKm: 300, pessoas: 5, horasDosPassos: 9 })).toEqual({
      horasDosPassos: 9,
      idaEVoltaKm: 600,
      internoKm: 60,
      internoSugeridoKm: 60,
      horasPorTrecho: 4.5,
      bateVolta: false,
      // (9 h de passos + 4h30 de ida + 4h30 de volta) ÷ 8 = 2,25 -> 3
      diasSugeridos: 3,
      dias: 3,
      noitesSugeridas: 2,
      noites: 2,
      pessoas: 5,
      veiculos: 2,
      kmPorVeiculo: 660,
    });
  });

  it('perto (100 km): bate-volta, a estrada sai de cada dia, e o veículo faz a ida e volta todo dia', () => {
    const c = calcular({ idaKm: 100, pessoas: 2, horasDosPassos: 9 });
    // 1h30 por trecho: sobram 5 h de trabalho por dia; 9 h -> 2 dias
    expect(c).toMatchObject({ horasPorTrecho: 1.5, bateVolta: true, dias: 2, noites: 0, veiculos: 1 });
    // 2 dias × 200 km + o interno (20 km)
    expect(c.kmPorVeiculo).toBe(420);
  });

  it('sem pessoas digitadas valem as do padrão (2); sem a distância, as horas ÷ 8, sem viagem nem noites', () => {
    expect(calcular({ horasDosPassos: 9 })).toMatchObject({ diasSugeridos: 2, bateVolta: null, noites: null, kmPorVeiculo: null, pessoas: 2, veiculos: 1 });
    expect(calcular({}, semPessoasPadrao)).toMatchObject({ diasSugeridos: null, dias: null, pessoas: null, veiculos: null });
  });

  it('o digitado manda: dias, interno (zero também vale) e as noites, que decidem o bate-volta', () => {
    // Zero noites numa viagem longa: a equipe volta todo dia (4 idas e voltas)
    expect(calcular({ idaKm: 300, horasDosPassos: 9, dias: 4, noites: 0, internoKm: 0 })).toMatchObject({ dias: 4, noites: 0, bateVolta: true, internoKm: 0, internoSugeridoKm: 60, kmPorVeiculo: 2400 });
    // Noites numa viagem curta: dorme no local, uma ida e volta só
    expect(calcular({ idaKm: 100, horasDosPassos: 9, dias: 3, noites: 2 })).toMatchObject({ bateVolta: false, noites: 2, kmPorVeiculo: 220 });
  });

  it('sem o ruído do ponto flutuante: 8,0000001 h não vira um dia a mais', () => {
    expect(calcular({ horasDosPassos: 8.0000001 }).diasSugeridos).toBe(1);
  });
});

describe('linhas automáticas', () => {
  it('longe: o km dos veículos e as refeições (café e jantar só nas noites fora)', () => {
    const linhas = porChave({ idaKm: 300, pessoas: 5, horasDosPassos: 9 });
    expect(linhas.KM).toMatchObject({ tabela: 'DESLOCAMENTO', quantidade: 2, km: 660, valor_km: 2.5 });
    expect(linhas.CAFE).toMatchObject({ tabela: 'DIARIA', quantidade: 10, valor_unitario: 10 });
    expect(linhas.ALMOCO).toMatchObject({ quantidade: 15, valor_unitario: 20 });
    expect(linhas.JANTAR).toMatchObject({ quantidade: 10, valor_unitario: 20 });
    expect(linhas.PERNOITE).toMatchObject({ quantidade: 10, valor_unitario: 100 });
  });

  it('bate-volta: só o almoço e o km', () => {
    expect(Object.keys(porChave({ idaKm: 100, pessoas: 2, horasDosPassos: 9 }))).toEqual(['KM', 'ALMOCO']);
  });

  it('sem pessoas (nem padrão), nenhuma refeição; sem km, nenhum veículo: nada se inventa', () => {
    expect(Object.keys(porChave({ idaKm: 300, horasDosPassos: 9 }, semPessoasPadrao))).toEqual(['KM']);
    expect(Object.keys(porChave({ pessoas: 3, horasDosPassos: 9 }))).toEqual(['ALMOCO']);
    expect(porChave({ pessoas: 3, horasDosPassos: 9 }).ALMOCO.quantidade).toBe(6);
    // As 2 do padrão
    expect(porChave({ horasDosPassos: 9 }).ALMOCO.quantidade).toBe(4);
  });
});

describe('sincronização das linhas', () => {
  const pedidas = linhasAutomaticas(calcular({ idaKm: 300, pessoas: 5, horasDosPassos: 9 }), PADROES_DA_LOGISTICA);
  const gravada = (automatica: string, mudar: Record<string, unknown> = {}) => ({ id: automatica, automatica, ajustada: false, ativo: true, quantidade: 1, km: null, ...mudar });

  it('cria a que falta, acerta a quantidade da que acompanha, não mexe na ajustada nem na igual', () => {
    const plano = planoDaSincronizacao(
      [gravada('ALMOCO', { quantidade: 4 }), gravada('JANTAR', { quantidade: 2, ajustada: true }), gravada('PERNOITE', { quantidade: 10 })],
      pedidas,
    );
    expect(plano.criar.map((l) => l.chave)).toEqual(['KM', 'CAFE']);
    expect(plano.atualizar).toEqual([{ id: 'ALMOCO', quantidade: 15, km: null }]);
    expect(plano.apagar).toEqual([]);
  });

  it('a que o planejamento não pede mais fica com zero (o preço e o nome acertados voltam com ela); nada se apaga', () => {
    const plano = planoDaSincronizacao(
      [gravada('CAFE'), gravada('JANTAR', { ativo: false }), gravada('PERNOITE', { quantidade: 0 }), { ...gravada('X'), automatica: null }],
      linhasAutomaticas(calcular({ idaKm: 100, pessoas: 2, horasDosPassos: 9 }), PADROES_DA_LOGISTICA),
    );
    expect(plano.atualizar).toEqual([
      { id: 'CAFE', quantidade: 0, km: null },
      { id: 'JANTAR', quantidade: 0, km: null },
    ]);
    expect(plano.apagar).toEqual([]);
    expect(plano.criar.map((l) => l.chave)).toEqual(['KM', 'ALMOCO']);
  });
});
