import { extensaoDaImagem } from './extensao-da-imagem';

/**
 * A extensão do arquivo enviado sai do tipo que o filtro aceitou, nunca do nome
 * que o cliente mandou: "x.html" declarado como image/png era gravado como
 * .html e servido como text/html pela rota pública (revisão do SN-38).
 */
describe('extensaoDaImagem', () => {
  it.each([
    ['image/jpeg', '.jpg'],
    ['image/jpg', '.jpg'],
    ['image/png', '.png'],
    ['image/gif', '.gif'],
    ['image/webp', '.webp'],
    ['IMAGE/PNG', '.png'],
  ])('%s vira %s', (tipo, extensao) => {
    expect(extensaoDaImagem(tipo)).toBe(extensao);
  });

  it('tipo fora da lista não vira extensão que o navegador execute', () => {
    expect(extensaoDaImagem('text/html')).toBe('.bin');
  });
});
