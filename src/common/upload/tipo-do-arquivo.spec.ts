import { BadRequestException } from '@nestjs/common';
import { conteudoDe } from '../../../test/arquivo-de-teste';
import { cabecalhosDoDownload, conferirConteudo, tipoPelaExtensao } from './tipo-do-arquivo';

/**
 * O tipo do arquivo pela extensão e o conteúdo conferido (revisão do SN-59): o
 * tipo declarado pelo cliente deixava um SVG com script voltar como SVG.
 */
describe('tipo do arquivo', () => {
  it.each([
    ['foto.PNG', 'image/png'],
    ['IMG_0001.HEIC', 'image/heic'],
    ['laudo.pdf', 'application/pdf'],
    ['planilha.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    // SVG, HTML e o que não está na lista baixam como arquivo, nunca como página
    ['desenho.svg', 'application/octet-stream'],
    ['pagina.html', 'application/octet-stream'],
    ['sem-extensao', 'application/octet-stream'],
  ])('%s -> %s', (nome, tipo) => {
    expect(tipoPelaExtensao(nome)).toBe(tipo);
  });

  it.each([['foto.png'], ['foto.jpg'], ['foto.webp'], ['IMG.heic'], ['laudo.pdf'], ['ata.docx'], ['velho.xls'], ['notas.txt']])(
    'o conteúdo de verdade de %s passa',
    (nome) => {
      expect(() => conferirConteudo(nome, conteudoDe(nome))).not.toThrow();
    },
  );

  it('SVG com script renomeado para .png é recusado', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    expect(() => conferirConteudo('foto.png', svg)).toThrow(BadRequestException);
  });

  it('PDF renomeado para .jpg é recusado (não conta como a foto do item)', () => {
    expect(() => conferirConteudo('foto.jpg', conteudoDe('laudo.pdf'))).toThrow(/não é JPG/);
  });

  it('o download: tipo pela extensão, nome codificado, nosniff', () => {
    expect(cabecalhosDoDownload('Relatório "final".pdf')).toEqual({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Relat_rio _final_.pdf"; filename*=UTF-8''Relat%C3%B3rio%20%22final%22.pdf`,
      'X-Content-Type-Options': 'nosniff',
    });
    // Quebra de linha no nome dava 500 no cabeçalho
    expect(cabecalhosDoDownload('a\r\nb.png')['Content-Disposition']).not.toMatch(/[\r\n]/);
  });
});
