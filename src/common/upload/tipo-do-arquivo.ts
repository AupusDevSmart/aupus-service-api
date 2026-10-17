import * as path from 'path';
import { BadRequestException } from '@nestjs/common';

/**
 * O tipo do arquivo pela EXTENSÃO, que o upload já valida — nunca pelo
 * Content-Type que o cliente declara (revisão do SN-59).
 *
 * Antes o tipo gravado e devolvido no download era o do cliente: um SVG com
 * script mandado como "foto.png" com `Content-Type: image/svg+xml` voltava
 * como SVG, a tela o abria num `blob:` da própria origem e o script lia a
 * sessão. Pela extensão, ".png" é sempre `image/png`, e o navegador não
 * executa nada.
 */
const POR_EXTENSAO: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
};

export const extensaoDe = (nome: string) => path.extname(nome).toLowerCase().slice(1);

/** O tipo pela extensão; extensão desconhecida baixa como arquivo genérico. */
export const tipoPelaExtensao = (nome: string) => POR_EXTENSAO[extensaoDe(nome)] ?? 'application/octet-stream';

/** O começo de cada formato: o arquivo tem de ser o que a extensão diz. */
const ASSINATURAS: Record<string, (b: Buffer) => boolean> = {
  png: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  jpg: (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  jpeg: (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  gif: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8',
  webp: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  // HEIC/HEIF (iPhone): caixa "ftyp" no byte 4
  heic: (b) => b.subarray(4, 8).toString('latin1') === 'ftyp',
  heif: (b) => b.subarray(4, 8).toString('latin1') === 'ftyp',
  pdf: (b) => b.subarray(0, 4).toString('latin1') === '%PDF',
  // Office novo é ZIP; o antigo, o contêiner OLE
  docx: (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
  xlsx: (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
  doc: (b) => b.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])),
  xls: (b) => b.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])),
};

/**
 * Recusa o arquivo cujo conteúdo não é o da extensão: o PDF renomeado para
 * ".jpg" contava como a foto que o item exige, e o SVG renomeado para ".png"
 * era o vetor do script. Extensão sem assinatura conhecida passa (texto).
 */
export function conferirConteudo(nomeOriginal: string, conteudo: Buffer): void {
  const extensao = extensaoDe(nomeOriginal);
  const confere = ASSINATURAS[extensao];
  if (confere && !confere(conteudo)) {
    throw new BadRequestException(`O conteúdo do arquivo "${path.basename(nomeOriginal)}" não é ${extensao.toUpperCase()}.`);
  }
}

/**
 * Os cabeçalhos do download: o tipo pela extensão (o que o banco guarda veio
 * do cliente, inclusive nos anexos antigos), o nome codificado (aspas e
 * acentos no nome original quebravam o cabeçalho, e quebra de linha dava 500)
 * e `nosniff`, para o navegador não adivinhar outro tipo.
 */
export function cabecalhosDoDownload(nomeOriginal: string): Record<string, string> {
  const ascii = path.basename(nomeOriginal).replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return {
    'Content-Type': tipoPelaExtensao(nomeOriginal),
    'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(path.basename(nomeOriginal))}`,
    'X-Content-Type-Options': 'nosniff',
  };
}
