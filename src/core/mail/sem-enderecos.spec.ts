import { semEnderecos } from './sem-enderecos';

describe('semEnderecos', () => {
  it('troca todo endereço de e-mail do texto', () => {
    expect(semEnderecos('550 <fulano.da-silva+x@empresa.com.br> rejected; cc ana@b.io')).toBe('550 <<e-mail>> rejected; cc <e-mail>');
  });

  it('texto sem endereço fica como está', () => {
    expect(semEnderecos('Connection timeout (smtp.exemplo:587)')).toBe('Connection timeout (smtp.exemplo:587)');
  });
});
