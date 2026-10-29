import { confereDespesas, dinheiroPara, ordemPermitida, precosPara, veOsCustos } from './quem-ve-os-custos';

/**
 * Quem vê dinheiro (28/out/2026): só quem programa ou gerencia. O cliente
 * (SERV-10) e o técnico de campo não; o técnico confere só as despesas de campo.
 */
describe('quem vê os custos', () => {
  const cliente = { id: 'c', permissions: ['execucao_os.view', 'programacao_os.view'] };
  const tecnico = { id: 't', permissions: ['execucao_os.view', 'execucao_os.executar'] };
  const planejador = { id: 'p', permissions: ['execucao_os.manage', 'programacao_os.manage'] };

  it('vê: quem gerencia a OS ou a programação, e a chamada interna; não vê: o técnico e o cliente', () => {
    expect([veOsCustos(planejador), veOsCustos(undefined), veOsCustos(tecnico), veOsCustos(cliente)]).toEqual([true, true, false, false]);
    // Quem edita instrução ou monta proposta vê o preço que vai salvar
    expect([veOsCustos({ permissions: ['manutencao.manage'] }), veOsCustos({ permissions: ['solicitacoes.manage'] })]).toEqual([true, true]);
    expect([confereDespesas(tecnico), confereDespesas(cliente)]).toEqual([true, false]);
  });

  const os = {
    custo_real: 1500,
    custos: { total: 1500 },
    tecnicos: [{ nome: 'Ana', horas_trabalhadas: 7, custo_hora: 78 }],
    itens_orcamento: [
      { descricao: 'Hospedagem', natureza: 'DESPESA_CAMPO', valor: 300, valor_real: 280 },
      { descricao: 'Termografista terceirizado', natureza: 'TERCEIRO', valor: 2400, valor_real: null },
      { descricao: 'Pedágio', natureza: 'OUTRO', nao_previsto: true, valor: 0, valor_real: 85 },
    ],
    // A mesma chave mais fundo (a programação dentro da OS) não é a lista das despesas
    programacao: { itens_orcamento: [{ descricao: 'Hospedagem', natureza: 'DESPESA_CAMPO', valor: 300 }] },
    historico: [{ descricao: 'Hospedagem: previsto R$ 300,00, conferido R$ 280,00' }],
  };

  it('a OS: o técnico recebe as despesas de campo (e as não previstas) e nada mais; o cliente, nada', () => {
    expect(dinheiroPara(planejador, os)).toBe(os);
    expect(dinheiroPara(tecnico, os)).toEqual({
      custo_real: null,
      custos: null,
      tecnicos: [{ nome: 'Ana', horas_trabalhadas: 7, custo_hora: null }],
      // O terceiro (contrato) sai; a não prevista vai inteira (o Executar apaga a que não volta)
      itens_orcamento: [
        { descricao: 'Hospedagem', natureza: 'DESPESA_CAMPO', valor: 300, valor_real: 280 },
        { descricao: 'Pedágio', natureza: 'OUTRO', nao_previsto: true, valor: 0, valor_real: 85 },
      ],
      programacao: { itens_orcamento: [] },
      historico: [{ descricao: 'Hospedagem: previsto R$ —, conferido R$ —' }],
    });
    // O texto que o técnico escreve volta no Executar: o "R$" dele fica (só a trilha perde o valor)
    const escrito = { problemas_encontrados: 'cabo comprado por R$ 180,00', historico: [{ descricao: 'Custo real de R$ 1,00' }] };
    expect(dinheiroPara(tecnico, escrito)).toEqual({ problemas_encontrados: 'cabo comprado por R$ 180,00', historico: [{ descricao: 'Custo real de R$ —' }] });
    expect(dinheiroPara(cliente, escrito).problemas_encontrados).toBe('cabo comprado por R$ —');
    // Na lista (a resposta paginada), cada OS é o nível de cima
    expect(dinheiroPara(tecnico, [os])[0].itens_orcamento).toHaveLength(2);
    expect(dinheiroPara(cliente, os)).toMatchObject({ itens_orcamento: [], tecnicos: [{ custo_hora: null }] });
  });

  it('ordenar por custo só para quem vê custos (a ordem contava qual OS custou mais)', () => {
    expect([ordemPermitida('custo_real', tecnico), ordemPermitida('custo_real', planejador), ordemPermitida('data_programada', tecnico)]).toEqual([
      'criado_em',
      'custo_real',
      'data_programada',
    ]);
  });

  it('a instrução: o preço de cada linha e o custo saem; os passos, os recursos e as quantidades ficam', () => {
    const instrucao = {
      nome: 'Termografia',
      custo: 1954.88,
      custo_por_grupo: [{ grupo: 'MAO_DE_OBRA', custo: 900 }],
      recursos: [{ quantidade: 2, preco_proprio: null, preco_base: 450, preco_cadastro: 450, subtotal: 900, recurso: { nome: 'Termografista', preco_base: 450, custo_origem: 'CADASTRO' } }],
    };
    expect(precosPara(planejador, instrucao)).toBe(instrucao);
    expect(precosPara(tecnico, instrucao)).toEqual({
      nome: 'Termografia',
      custo: null,
      custo_por_grupo: null,
      recursos: [{ quantidade: 2, preco_proprio: null, preco_base: null, preco_cadastro: null, subtotal: null, recurso: { nome: 'Termografista', preco_base: null, custo_origem: null } }],
    });
  });
});
