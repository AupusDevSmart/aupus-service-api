import { comOCustoRegistrado, resumoDoCusto, type DadosDoCusto } from './resumo-do-custo';

/**
 * A conta do custo da OS (SN-93): a do custo real gravado, do painel, do sheet e
 * do PDF. Os casos do custo pelas linhas (SN-61, SN-81) vieram de `custoDasLinhas`.
 */
const vazio = (mudar: Partial<DadosDoCusto> = {}): DadosDoCusto => ({
  equipe: [],
  materiais: [],
  outros: [],
  custos_adicionais: null,
  instrucoes: [],
  orcamento_previsto: null,
  outros_no_real: true,
  ...mudar,
});

const pessoa = (custo_hora: number | null, horas_trabalhadas: number | null, horas_estimadas = 8, nome = 'Ana') => ({
  nome,
  especialidade: 'Eletricista',
  horas_estimadas,
  horas_trabalhadas,
  custo_hora,
});
const material = (custo_unitario: number | null, quantidade_consumida: number | null, quantidade_planejada = 1, descricao = 'Cabo') => ({
  descricao,
  unidade: 'm',
  quantidade_planejada,
  quantidade_consumida,
  custo_unitario,
});
const outro = (previsto: number, real: number | null, natureza: DadosDoCusto['outros'][number]['natureza'] = 'VEICULO', nao_previsto = false) => ({
  descricao: `${natureza} ${previsto}`,
  natureza,
  previsto,
  real,
  nao_previsto,
});
const natureza = (r: ReturnType<typeof resumoDoCusto>, n: string) => r.naturezas.find((l) => l.natureza === n);

describe('resumoDoCusto: mão de obra e material (as regras de custoDasLinhas)', () => {
  it('material pelo consumido; mão de obra pelas horas trabalhadas', () => {
    const r = resumoDoCusto(vazio({ materiais: [material(10, 3), material(2.5, 4)], equipe: [pessoa(80, 2.5), pessoa(60, 1)] }));
    expect([natureza(r, 'MATERIAL')!.real, natureza(r, 'MAO_DE_OBRA')!.real, r.real]).toEqual([40, 260, 300]);
  });

  it('o material planejado e não consumido não custa; sem custo unitário, também não (e a pendência diz)', () => {
    const r = resumoDoCusto(vazio({ materiais: [material(10, null), material(null, 5, 5, 'Fita')] }));
    expect(natureza(r, 'MATERIAL')!.real).toBe(0);
    expect(r.pendencias).toContain('Sem custo unitário, fora do custo: Fita.');
  });

  // Revisão do SN-93: "Material R$ 0,00 −100%" em verde parecia economia de quem não registrou o consumo
  it('consumo não registrado depois do Executar vira pendência; antes dele, é o normal', () => {
    const dados = vazio({ materiais: [material(1200, null, 1, 'Inversor reserva'), material(10, 0, 2, 'Fita')] });
    expect(resumoDoCusto(dados).pendencias).toContain('Consumo não registrado, fora do custo: Inversor reserva.');
    expect(resumoDoCusto({ ...dados, apurado: false }).pendencias.some((p) => p.includes('Consumo não registrado'))).toBe(false);
  });

  it('sem horas registradas (OS anterior ao SN-61), vale a estimada; sem valor/hora, não custa e a pendência diz quem', () => {
    const r = resumoDoCusto(vazio({ equipe: [pessoa(50, null, 4), pessoa(null, 3, 8, 'Rui')] }));
    expect(natureza(r, 'MAO_DE_OBRA')!.real).toBe(200);
    expect(r.pendencias).toContain('Sem valor/hora, fora do custo: Rui (3 h).');
  });

  // Em float, 0,5 h x R$ 2,01 dava 1,00 na linha e 1,01 no custo da OS
  it('cada linha em centavos, metade para cima, antes de somar', () => {
    const r = resumoDoCusto(vazio({ equipe: [pessoa(2.01, 0.5), pessoa(2.01, 0.5)] }));
    expect(r.real).toBe(2.02);
  });

  it('o previsto é a mesma conta pelas horas estimadas e o material planejado', () => {
    const r = resumoDoCusto(vazio({ equipe: [pessoa(78, 7, 8)], materiais: [material(12.5, 3, 4)] }));
    expect([natureza(r, 'MAO_DE_OBRA')!.previsto, natureza(r, 'MATERIAL')!.previsto, r.previsto]).toEqual([624, 50, 674]);
    expect(r.equipe[0]).toMatchObject({ valor_hora: 78, previsto: 624, real: 546 });
  });
});

describe('resumoDoCusto: outros custos (D2)', () => {
  // A OSP-2026-0145: o real gravado era só a mão de obra; veículo, hospedagem e alimentação ficavam de fora
  it('o conferido entra pelo valor real; o não conferido, pelo previsto (e a pendência diz)', () => {
    const r = resumoDoCusto(
      vazio({ outros: [outro(1316, 1402.5, 'VEICULO'), outro(1380, null, 'DESPESA_CAMPO'), outro(468, 0, 'DESPESA_CAMPO')] }),
    );
    expect(natureza(r, 'VEICULO')).toMatchObject({ previsto: 1316, real: 1402.5 });
    expect(natureza(r, 'DESPESA_CAMPO')).toMatchObject({ rotulo: 'Despesas de campo', previsto: 1848, real: 1380 });
    expect(r.real).toBe(2782.5);
    // A soma no plural, o item no singular (o sheet dizia "Instrumentos · previsto R$ 160,00" de um item só)
    expect(r.outros.find((o) => o.natureza === 'DESPESA_CAMPO' && !o.conferido)).toMatchObject({ no_real: 1380, real: null, rotulo: 'Despesa de campo' });
    expect(r.pendencias).toContain('1 outro custo não foi conferido e entra pelo previsto.');
  });

  it('o não previsto fica numa linha própria, sem previsto, e os adicionais antigos noutra', () => {
    const r = resumoDoCusto(vazio({ outros: [outro(0, 85, 'OUTRO', true)], custos_adicionais: 40 }));
    expect(natureza(r, 'NAO_PREVISTO')).toMatchObject({ previsto: 0, real: 85 });
    expect(natureza(r, 'ADICIONAIS')).toMatchObject({ rotulo: 'Adicionais (sem descrição)', real: 40 });
    expect([r.previsto, r.real]).toEqual([0, 125]);
  });

  it('na OS finalizada antes do SN-93 (conteúdo da versão 1), os outros custos aparecem pelo previsto e fora do total', () => {
    const r = resumoDoCusto(vazio({ equipe: [pessoa(78, 7)], outros: [outro(1316, null)], custos_adicionais: 40, outros_no_real: false }));
    expect(r.real).toBe(546);
    // Fora do total é null, não zero: "R$ 0,00, −100%" leria como economia
    expect(natureza(r, 'VEICULO')).toMatchObject({ previsto: 1316, real: null });
    expect(natureza(r, 'ADICIONAIS')).toMatchObject({ real: null });
    expect(r.outros[0]).toMatchObject({ conferido: false, no_real: null });
    expect(r.outros_fora_do_total).toBe(true);
    expect(r.pendencias.some((p) => p.includes('não tinha os outros custos'))).toBe(true);
    expect(r.pendencias.some((p) => p.includes('não foi conferido'))).toBe(false);
  });

  // O caso da revisão: o destaque dizia "−R$ 4.000 (−40%)", uma economia que não houve
  it('na OS de antes, o previsto comparado com o real é o do que entra nele (mão de obra e material)', () => {
    const r = resumoDoCusto(
      vazio({
        equipe: [pessoa(625, 8, 8)],
        materiais: [material(1000, 1, 1)],
        outros: [outro(4000, null)],
        custos_adicionais: 300,
        orcamento_previsto: 10000,
        outros_no_real: false,
      }),
    );
    expect([r.real, r.previsto]).toEqual([6000, 6000]);
    // O ajuste da aprovação continua contra todas as linhas (o orçamento tinha o veículo)
    expect(r.ajuste_do_orcamento).toBe(0);
    expect(resumoDoCusto(vazio({ equipe: [pessoa(625, 8, 8)], outros: [outro(4000, null)] })).outros_fora_do_total).toBe(false);
  });

  it('o custo registrado diferente da conta pelas linhas vira pendência (a OS finalizada pelas regras de antes)', () => {
    const r = resumoDoCusto(vazio({ equipe: [pessoa(78, 7)] }));
    expect(comOCustoRegistrado(r, 546)).toBe(r);
    expect(comOCustoRegistrado(r, null)).toBe(r);
    const diferente = comOCustoRegistrado(r, 500);
    expect(diferente.real).toBe(546);
    expect(diferente.pendencias[diferente.pendencias.length - 1].replace(/\s/g, ' ')).toBe('Custo real registrado na finalização: R$ 500,00 (a conta pelas linhas registradas dá R$ 546,00).');
  });

  it('a diferença para o orçamento gravado é o ajuste da aprovação', () => {
    const r = resumoDoCusto(vazio({ equipe: [pessoa(78, 8)], outros: [outro(100, 100)], orcamento_previsto: 800 }));
    expect([r.previsto, r.orcamento_previsto, r.ajuste_do_orcamento]).toEqual([724, 800, 76]);
  });
});

describe('resumoDoCusto: instruções (D1)', () => {
  const instrucao = (status: string, valor: number | null, valor_original: number | null = valor, extra = {}) => ({
    codigo: 'INV-03',
    nome: 'Termografia e reaperto',
    equipamento: 'Inversor 01',
    status,
    valor,
    valor_original,
    ...extra,
  });

  it('cada instrução com o valor dela e o total das feitas, ao lado do apurado', () => {
    const r = resumoDoCusto(vazio({ instrucoes: [instrucao('CONCLUIDA', 902.08), instrucao('CANCELADA', 902.08), instrucao('CONCLUIDA', 850, 902.08)] }));
    expect([r.instrucoes_total, r.instrucoes_feitas, r.instrucoes_feitas_total]).toEqual([2654.16, 2, 1752.08]);
    expect(r.instrucoes.map((i) => [i.feita, i.ajustado])).toEqual([
      [true, false],
      [false, false],
      [true, true],
    ]);
  });

  it('a linha de antes do SN-93 (sem valor) mostra o do cadastro de hoje, marcada', () => {
    const r = resumoDoCusto(vazio({ instrucoes: [instrucao('CONCLUIDA', null, null, { valor_do_cadastro_hoje: 700 })] }));
    expect(r.instrucoes[0]).toMatchObject({ valor: 700, do_cadastro_hoje: true, ajustado: false });
    expect(r.pendencias.some((p) => p.includes('cadastro de hoje'))).toBe(true);
  });

  it('o valor das instruções não entra no custo real: o real é o apurado (D4)', () => {
    const r = resumoDoCusto(vazio({ equipe: [pessoa(78, 7)], instrucoes: [instrucao('CONCLUIDA', 5000)] }));
    expect(r.real).toBe(546);
  });
});
