import * as path from 'path';

/**
 * Um arquivo de teste cujo começo é o do formato da extensão: o upload confere
 * o conteúdo contra a extensão (common/upload/tipo-do-arquivo.ts) e recusa o
 * "jpeg" de 4 letras que os specs mandavam.
 */
const INICIOS: Record<string, Buffer> = {
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpg: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  gif: Buffer.from('GIF89a', 'latin1'),
  webp: Buffer.from('RIFF\0\0\0\0WEBP', 'latin1'),
  heic: Buffer.from('\0\0\0\x18ftypheic', 'latin1'),
  heif: Buffer.from('\0\0\0\x18ftypmif1', 'latin1'),
  pdf: Buffer.from('%PDF-1.4', 'latin1'),
  docx: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  xlsx: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  doc: Buffer.from([0xd0, 0xcf, 0x11, 0xe0]),
  xls: Buffer.from([0xd0, 0xcf, 0x11, 0xe0]),
};

export function conteudoDe(nome: string): Buffer {
  const inicio = INICIOS[path.extname(nome).toLowerCase().slice(1)] ?? Buffer.from('texto', 'latin1');
  return Buffer.concat([inicio, Buffer.from('resto do arquivo', 'latin1')]);
}

/** O arquivo como o multer entrega, com o conteúdo certo para a extensão. */
export const arquivoDeTeste = (nome: string, mimetype = 'application/octet-stream') => {
  const buffer = conteudoDe(nome);
  return { originalname: nome, mimetype, size: buffer.length, buffer };
};
