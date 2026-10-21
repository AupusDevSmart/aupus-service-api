import { deflateSync } from 'node:zlib';

/**
 * Foto de exemplo do seed: um PNG de verdade (o upload confere a assinatura do
 * arquivo), com um fundo por assunto e um rótulo que diz o que ela representa.
 * Ninguém confunde com foto de campo: a primeira linha é "FOTO DE EXEMPLO".
 */

const LARGURA = 480;
const ALTURA = 320;
const ESCALA = 3;

/** Fonte 5x7: cada linha do caractere são 5 bits, do mais à esquerda para o mais à direita */
const FONTE: Record<string, number[]> = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '3': [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '/': [0b00001, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b10000],
  ':': [0, 0b01100, 0b01100, 0, 0b01100, 0b01100, 0],
  '.': [0, 0, 0, 0, 0, 0b01100, 0b01100],
  ',': [0, 0, 0, 0, 0b01100, 0b00100, 0b01000],
  '(': [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ')': [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  '%': [0b11000, 0b11001, 0b00010, 0b00100, 0b01000, 0b10011, 0b00011],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

export type AssuntoDaFoto = 'termografia' | 'antes' | 'depois' | 'leitura' | 'defeito' | 'geral';

type Cor = [number, number, number];

/** O fundo de cada assunto: termografia em escala de calor, o resto em tons sóbrios */
function fundo(assunto: AssuntoDaFoto, x: number, y: number): Cor {
  const t = x / LARGURA;
  const s = y / ALTURA;
  switch (assunto) {
    case 'termografia': {
      // Do frio (azul) ao quente (amarelo), com um ponto quente no meio
      const dx = x - LARGURA * 0.62;
      const dy = y - ALTURA * 0.38;
      const calor = Math.min(1, Math.max(0, t * 0.6 + Math.exp(-(dx * dx + dy * dy) / 2600) * 0.9));
      return [Math.round(40 + 215 * calor), Math.round(30 + 180 * calor * calor), Math.round(140 * (1 - calor))];
    }
    case 'antes':
      return [Math.round(120 + 40 * s), Math.round(105 + 30 * s), Math.round(80 + 20 * t)];
    case 'depois':
      return [Math.round(70 + 30 * t), Math.round(120 + 40 * s), Math.round(110 + 30 * t)];
    case 'leitura':
      return [Math.round(55 + 30 * t), Math.round(70 + 30 * t), Math.round(90 + 40 * s)];
    case 'defeito':
      return [Math.round(130 + 50 * s), Math.round(70 + 20 * t), Math.round(60 + 20 * t)];
    default:
      return [Math.round(85 + 40 * t), Math.round(95 + 40 * t), Math.round(105 + 40 * s)];
  }
}

const semAcento = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/°/g, ' GRAUS')
    .toUpperCase();

/** Quebra o rótulo em linhas que cabem na largura */
function linhas(texto: string, porLinha: number): string[] {
  const saida: string[] = [];
  let atual = '';
  for (const palavra of semAcento(texto).split(/\s+/)) {
    if ((atual + ' ' + palavra).trim().length > porLinha) {
      if (atual) saida.push(atual);
      atual = palavra.slice(0, porLinha);
    } else {
      atual = (atual + ' ' + palavra).trim();
    }
  }
  if (atual) saida.push(atual);
  return saida;
}

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

function crc32(dados: Buffer): number {
  let c = 0xffffffff;
  for (const byte of dados) c = TABELA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloco(tipo: string, dados: Buffer): Buffer {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, crc]);
}

/** O PNG do assunto com o rótulo (a primeira linha sempre diz que é exemplo) */
export function fotoDeExemplo(assunto: AssuntoDaFoto, rotulo: string): Buffer {
  const pixels = Buffer.alloc(LARGURA * ALTURA * 3);
  for (let y = 0; y < ALTURA; y++) {
    for (let x = 0; x < LARGURA; x++) {
      const [r, g, b] = fundo(assunto, x, y);
      const i = (y * LARGURA + x) * 3;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
    }
  }

  const larguraDoCaractere = 6 * ESCALA;
  const alturaDaLinha = 9 * ESCALA;
  const porLinha = Math.floor((LARGURA - 24) / larguraDoCaractere);
  const texto = ['FOTO DE EXEMPLO (SEED)', ...linhas(rotulo, porLinha)].slice(0, 5);
  const topoDaFaixa = ALTURA - texto.length * alturaDaLinha - 16;

  // Faixa escura atrás do texto, para ler em qualquer fundo
  for (let y = topoDaFaixa; y < ALTURA; y++) {
    for (let x = 0; x < LARGURA; x++) {
      const i = (y * LARGURA + x) * 3;
      pixels[i] = Math.round(pixels[i] * 0.25);
      pixels[i + 1] = Math.round(pixels[i + 1] * 0.25);
      pixels[i + 2] = Math.round(pixels[i + 2] * 0.25);
    }
  }

  texto.forEach((linha, n) => {
    const y0 = topoDaFaixa + 8 + n * alturaDaLinha;
    [...linha].forEach((caractere, k) => {
      const glifo = FONTE[caractere] ?? FONTE[' '];
      const x0 = 12 + k * larguraDoCaractere;
      glifo.forEach((bits, gy) => {
        for (let gx = 0; gx < 5; gx++) {
          if (!(bits & (1 << (4 - gx)))) continue;
          for (let dy = 0; dy < ESCALA; dy++) {
            for (let dx = 0; dx < ESCALA; dx++) {
              const x = x0 + gx * ESCALA + dx;
              const y = y0 + gy * ESCALA + dy;
              if (x >= LARGURA || y >= ALTURA) continue;
              const i = (y * LARGURA + x) * 3;
              pixels[i] = 240;
              pixels[i + 1] = 240;
              pixels[i + 2] = 235;
            }
          }
        }
      });
    });
  });

  // Cada linha do PNG começa com o filtro (0 = nenhum)
  const cru = Buffer.alloc((LARGURA * 3 + 1) * ALTURA);
  for (let y = 0; y < ALTURA; y++) {
    cru[y * (LARGURA * 3 + 1)] = 0;
    pixels.copy(cru, y * (LARGURA * 3 + 1) + 1, y * LARGURA * 3, (y + 1) * LARGURA * 3);
  }

  const cabecalho = Buffer.alloc(13);
  cabecalho.writeUInt32BE(LARGURA, 0);
  cabecalho.writeUInt32BE(ALTURA, 4);
  cabecalho[8] = 8; // bits por canal
  cabecalho[9] = 2; // RGB
  cabecalho[10] = 0;
  cabecalho[11] = 0;
  cabecalho[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', cabecalho),
    bloco('IDAT', deflateSync(cru, { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

/** O arquivo como o multer entregaria ao service */
export function arquivoDaFoto(nome: string, conteudo: Buffer) {
  return { originalname: nome, mimetype: 'image/png', size: conteudo.length, buffer: conteudo };
}
