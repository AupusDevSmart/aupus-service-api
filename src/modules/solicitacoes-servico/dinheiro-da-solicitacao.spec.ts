import { nivelDaProposta, propostaPara, solicitacaoPara } from './dinheiro-da-solicitacao';

/**
 * O dinheiro da proposta pelo nível de quem pede (28/out/2026): inteira para quem
 * monta proposta; a do PDF para o cliente dono (sem a composição do BDI e, na conta
 * de imposto e margem de 29/out/2026, sem custo, percentual nem as tabelas); nada
 * para os outros (o técnico).
 */
describe('o dinheiro da solicitação', () => {
  const planejador = { id: 'p', permissions: ['solicitacoes.manage'] };
  const dono = { id: 'dono', permissions: ['solicitacoes.view', 'solicitacoes.create'] };
  const tecnico = { id: 't', permissions: ['solicitacoes.view', 'solicitacoes.create', 'execucao_os.executar'] };

  it('o nível: quem monta proposta, o dono da planta (pelo id aparado) e os outros', () => {
    expect(nivelDaProposta(planejador, 'dono')).toBe('inteira');
    expect(nivelDaProposta(undefined, 'dono')).toBe('inteira');
    expect(nivelDaProposta(dono, 'dono ')).toBe('do_cliente');
    expect(nivelDaProposta(tecnico, 'dono')).toBe('nenhuma');
    expect(nivelDaProposta(dono, null)).toBe('nenhuma');
  });

  // O dono é o da planta: o proprietario_id gravado vinha do corpo do cadastro (o técnico mandava o dele)
  const linha = { proprietario_id: 't', planta: { proprietario_id: 'dono' }, titulo: 'Troca', bdi_lucro: 5, bdi_issqn: 6.5, bdi_percentual: 30.438, total_geral: 1504.38, total_lucro: null };

  it('a linha: o dono não recebe a composição do BDI; o técnico, nenhum dinheiro', () => {
    expect(solicitacaoPara(planejador, linha)).toBe(linha);
    expect(solicitacaoPara(dono, linha)).toEqual({ ...linha, bdi_lucro: null, bdi_issqn: null, total_lucro: null });
    expect(solicitacaoPara(tecnico, linha)).toEqual({ ...linha, bdi_lucro: null, bdi_issqn: null, bdi_percentual: null, total_geral: null, total_lucro: null });
    expect(solicitacaoPara(dono, { ...linha, planta: null })).toMatchObject({ total_geral: null });
  });

  const proposta = {
    conta_da_proposta: 'BDI',
    itens: [{ descricao: 'SRV-02', preco_unitario: 1000, preco_unitario_original: 1000 }],
    outros_custos: [{ descricao: 'Guindaste', valor: 200 }],
    logistica: [],
    instrucoes_sem_preco: ['x'],
    bdi_regime: 'SEM_REIDI',
    bdi_lucro: 5,
    bdi_percentual: 30.438,
    total_custo: 1200,
    total_geral: 1504.38,
  };

  it('a proposta de antes (BDI): o dono a recebe como no PDF dele (sem o preço de cadastro); o técnico, sem valor nenhum', () => {
    expect(propostaPara('inteira', proposta)).toBe(proposta);
    expect(propostaPara('do_cliente', proposta)).toEqual({
      ...proposta,
      bdi_regime: null,
      bdi_lucro: null,
      fechamento: null,
      instrucoes_sem_preco: [],
      itens: [{ descricao: 'SRV-02', preco_unitario: 1000, preco_unitario_original: null }],
    });
    expect(propostaPara('nenhuma', proposta)).toEqual({
      conta_da_proposta: 'BDI',
      itens: [{ descricao: 'SRV-02', preco_unitario: null, preco_unitario_original: null, valor_venda: null }],
      outros_custos: [{ descricao: 'Guindaste', valor: null }],
      logistica: [],
      instrucoes_sem_preco: [],
      bdi_regime: null,
      bdi_lucro: null,
      bdi_percentual: null,
      total_custo: null,
      total_geral: null,
      fechamento: null,
      venda: null,
    });
  });

  // A conta nova (29/out/2026): o preço da linha é custo, e o de venda é o que vai ao cliente
  const nova = {
    conta_da_proposta: 'IMPOSTO_MARGEM',
    itens: [{ descricao: 'SRV-02', preco_unitario: 10000, preco_unitario_original: 10000, valor_venda: 15384.62 }],
    outros_custos: [
      { descricao: 'Guindaste', valor: 5000, faturamento_direto: true },
      { descricao: 'ART', valor: 100, faturamento_direto: false },
    ],
    logistica: [{ tabela: 'DIARIA', descricao: 'Almoço', quantidade: 6, valor_unitario: 45, total: 270 }],
    instrucoes_sem_preco: [],
    imposto_percentual: 15,
    margem_percentual: 20,
    margem_efetiva: 22.8,
    valor_imposto: 2413.57,
    total_custo: 15000,
    total_servicos: 10000,
    total_fd: 5000,
    total_aupus: 16090.5,
    total_geral: 21090.5,
    dias_previstos: 2,
    pessoas_previstas: 3,
    fechamento: { custo_servicos: 10000 },
    venda: { logistica: 415.38, adicionais: 153.85 },
  };

  it('a conta nova: o dono vê a venda e os totais, sem custo, percentual nem as tabelas; o técnico vê o que vai, sem dinheiro', () => {
    expect(propostaPara('do_cliente', nova)).toEqual({
      ...nova,
      itens: [{ descricao: 'SRV-02', preco_unitario: null, preco_unitario_original: null, valor_venda: 15384.62 }],
      outros_custos: [
        { descricao: 'Guindaste', valor: 5000, faturamento_direto: true },
        { descricao: 'ART', valor: null, faturamento_direto: false },
      ],
      logistica: [],
      imposto_percentual: null,
      margem_percentual: null,
      margem_efetiva: null,
      valor_imposto: null,
      total_custo: null,
      total_servicos: null,
      pessoas_previstas: null,
      fechamento: null,
    });
    const doTecnico = propostaPara('nenhuma', nova);
    expect(doTecnico).toMatchObject({ total_aupus: null, total_fd: null, total_geral: null, venda: null, fechamento: null, dias_previstos: 2 });
    expect(doTecnico.itens).toEqual([{ descricao: 'SRV-02', preco_unitario: null, preco_unitario_original: null, valor_venda: null }]);
    expect(doTecnico.logistica).toEqual([{ tabela: 'DIARIA', descricao: 'Almoço', quantidade: 6, valor_unitario: null, total: null }]);
  });

  it('o histórico de quem não monta proposta: sem os reais no texto e sem o motivo de reabrir', () => {
    const historico = [
      { acao: 'PROPOSTA_CONVERTIDA', observacoes: 'Proposta passada para a conta de imposto e margem: de R$ 7.294,10 (BDI) para R$ 8.932,02.' },
      { acao: 'PROPOSTA_REABERTA', observacoes: 'margem ficou em 12%, subir para 25%' },
      { acao: 'PROPOSTA_NAO_APROVADA', observacoes: 'Achou caro' },
    ];
    const linhaComHistorico = { planta: { proprietario_id: 'dono' }, historico };
    expect(solicitacaoPara(planejador, linhaComHistorico).historico).toBe(historico);
    expect(solicitacaoPara(tecnico, linhaComHistorico).historico!.map((h) => h.observacoes)).toEqual([
      'Proposta passada para a conta de imposto e margem: de R$ — (BDI) para R$ —.',
      'Proposta reaberta',
      'Achou caro',
    ]);
    expect(solicitacaoPara(dono, linhaComHistorico).historico![1].observacoes).toBe('Proposta reaberta');
  });

  it('a linha da conta nova: o dono não recebe a margem nem o custo; na de antes, o custo segue (o PDF dele o mostrava)', () => {
    const daNova = { planta: { proprietario_id: 'dono' }, conta_da_proposta: 'IMPOSTO_MARGEM', total_custo: 15000, margem_efetiva: 22.8, total_aupus: 16090.5 };
    expect(solicitacaoPara(dono, daNova)).toEqual({ ...daNova, total_custo: null, margem_efetiva: null });
    expect(solicitacaoPara(tecnico, daNova)).toEqual({ ...daNova, total_custo: null, margem_efetiva: null, total_aupus: null });
    const deAntes = { ...daNova, conta_da_proposta: 'BDI' };
    expect(solicitacaoPara(dono, deAntes)).toMatchObject({ total_custo: 15000 });
  });
});
