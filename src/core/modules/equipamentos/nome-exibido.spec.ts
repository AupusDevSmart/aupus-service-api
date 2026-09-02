import { comNomeDaPosicao } from './nome-exibido';

describe('comNomeDaPosicao', () => {
  it('usa o nome da posicao no campo `nome`', () => {
    const saida = comNomeDaPosicao({
      id: 'eq1',
      nome: 'Motor WEG 15cv SN-4471',
      ativo_funcional: { id: 'af1', nome: 'Motor 3/11' },
    });

    expect(saida.nome).toBe('Motor 3/11');
  });

  it('preserva o nome proprio do equipamento em campo separado', () => {
    const saida = comNomeDaPosicao({
      id: 'eq1',
      nome: 'Motor WEG 15cv SN-4471',
      ativo_funcional: { id: 'af1', nome: 'Motor 3/11' },
    });

    // O nome do equipamento nao se perde — ele so deixa de ser o exibido.
    expect(saida.nome_proprio).toBe('Motor WEG 15cv SN-4471');
  });

  it('mantem o nome do equipamento quando ainda nao ha posicao', () => {
    // Durante a migracao a maioria dos equipamentos nao tem posicao. Trocar o
    // nome por vazio deixaria a tela em branco em todo lugar que le `nome`.
    const saida = comNomeDaPosicao({ id: 'eq1', nome: 'Motor A', ativo_funcional: null });

    expect(saida.nome).toBe('Motor A');
    expect(saida.nome_proprio).toBe('Motor A');
  });

  it('mantem o nome do equipamento quando a relacao nao foi incluida na consulta', () => {
    // Consulta sem `include` nao significa "sem posicao" — significa "nao sei".
    // Assumir ausencia apagaria o nome em toda rota que nao inclui a relacao.
    const saida = comNomeDaPosicao({ id: 'eq1', nome: 'Motor A' });

    expect(saida.nome).toBe('Motor A');
  });

  it('nao inventa nome quando a posicao existe sem nome', () => {
    const saida = comNomeDaPosicao({
      id: 'eq1',
      nome: 'Motor A',
      ativo_funcional: { id: 'af1', nome: '' },
    });

    expect(saida.nome).toBe('Motor A');
  });

  it('nao altera os demais campos', () => {
    const entrada = {
      id: 'eq1',
      nome: 'Motor A',
      modelo: 'W22',
      numero_serie: 'SN-1',
      ativo_funcional: { id: 'af1', nome: 'Motor 3/11' },
    };
    const saida = comNomeDaPosicao(entrada);

    expect(saida.modelo).toBe('W22');
    expect(saida.numero_serie).toBe('SN-1');
    expect(saida.id).toBe('eq1');
  });

  it('devolve null e undefined intactos', () => {
    expect(comNomeDaPosicao(null)).toBeNull();
    expect(comNomeDaPosicao(undefined)).toBeUndefined();
  });

  it('aplica em lista', () => {
    const saida = comNomeDaPosicao([
      { id: 'a', nome: 'Motor A', ativo_funcional: { id: 'af1', nome: 'Motor 3/11' } },
      { id: 'b', nome: 'Motor B', ativo_funcional: null },
    ]);

    expect(saida.map((e: any) => e.nome)).toEqual(['Motor 3/11', 'Motor B']);
  });
});
