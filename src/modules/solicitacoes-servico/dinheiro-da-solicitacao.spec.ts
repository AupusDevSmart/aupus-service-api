import { nivelDaProposta, propostaPara, solicitacaoPara } from './dinheiro-da-solicitacao';

/**
 * O dinheiro da proposta pelo nível de quem pede (28/out/2026): inteira para quem
 * monta proposta; a do PDF (sem a composição do BDI) para o cliente dono; nada
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
    itens: [{ descricao: 'SRV-02', preco_unitario: 1000, preco_unitario_original: 1000 }],
    outros_custos: [{ descricao: 'Guindaste', valor: 200 }],
    instrucoes_sem_preco: ['x'],
    bdi_regime: 'SEM_REIDI',
    bdi_lucro: 5,
    bdi_percentual: 30.438,
    total_geral: 1504.38,
  };

  it('a proposta: o dono a recebe como no PDF (sem o preço de cadastro); o técnico, sem valor nenhum', () => {
    expect(propostaPara('inteira', proposta)).toBe(proposta);
    expect(propostaPara('do_cliente', proposta)).toEqual({
      ...proposta,
      bdi_regime: null,
      bdi_lucro: null,
      instrucoes_sem_preco: [],
      itens: [{ descricao: 'SRV-02', preco_unitario: 1000, preco_unitario_original: null }],
    });
    expect(propostaPara('nenhuma', proposta)).toEqual({
      itens: [{ descricao: 'SRV-02', preco_unitario: null, preco_unitario_original: null }],
      outros_custos: [{ descricao: 'Guindaste', valor: null }],
      instrucoes_sem_preco: [],
      bdi_regime: null,
      bdi_lucro: null,
      bdi_percentual: null,
      total_geral: null,
    });
  });
});
