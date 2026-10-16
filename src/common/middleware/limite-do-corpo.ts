import type { NextFunction, Request, Response } from 'express';

function recusar(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, error: { code, message } });
}

const ehJson = (req: Request) => (req.headers['content-type'] ?? '').toLowerCase().includes('json');
const dentroDe = (req: Request, prefixos: string[]) => prefixos.some((p) => req.originalUrl === p || req.originalUrl.startsWith(`${p}/`) || req.originalUrl.startsWith(`${p}?`));

/**
 * Recusa o pedido grande demais PELO TAMANHO, antes do body-parser ler o corpo
 * (SN-47, SN-50). O parser aceita 20 MB porque a importação de planilha
 * precisa. `exceto`: prefixos de rota que ficam só com o limite do parser. Só
 * JSON: upload (multipart) tem o limite próprio do multer. O Content-Length é
 * o tamanho de verdade porque o parser recusa corpo compactado (inflate: false
 * em configurar-app.ts) — com gzip/brotli, 105 kB viravam 2,5 MB.
 *
 * Sem `Content-Length` e com corpo (chunked), não há como saber o tamanho antes
 * de ler: recusa também. Navegador e axios sempre mandam o tamanho.
 */
export function limiteDoCorpo(bytes: number, opcoes: { exceto?: string[]; soJson?: boolean } = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (opcoes.soJson && !ehJson(req)) return next();
    if (opcoes.exceto && dentroDe(req, opcoes.exceto)) return next();
    const declarado = req.headers['content-length'];
    const semTamanho = declarado === undefined && req.headers['transfer-encoding'] !== undefined;
    if (semTamanho || Number(declarado) > bytes) {
      return recusar(res, 413, 'PAYLOAD_TOO_LARGE', `Pedido grande demais para esta rota (máximo ${Math.round(bytes / 1024)} kB)`);
    }
    next();
  };
}

/**
 * Só deixa o parser ler o corpo de quem mandou um token de acesso válido: a
 * importação aceita 20 MB, e sem isto um anônimo fazia a API ler e percorrer
 * 20 MB antes de o guard responder 401. O guard de verdade continua valendo
 * depois (permissão, usuário ativo).
 */
export function loginAntesDoCorpo(tokenValido: (token: string) => boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const [tipo, token] = (req.headers.authorization ?? '').split(' ');
    if (tipo?.toLowerCase() === 'bearer' && token && tokenValido(token)) return next();
    recusar(res, 401, 'UNAUTHORIZED', 'Faça login para enviar este pedido');
  };
}

export interface TetoDoCorpo {
  /** Itens numa lista só. */
  porLista: number;
  /** Campos num objeto só. */
  porObjeto: number;
  /** Itens de lista mais campos de objeto, no corpo inteiro. */
  total: number;
}

export const PROFUNDIDADE_MAXIMA = 64;

const ASPAS = 0x22;
const BARRA = 0x5c;
const VIRGULA = 0x2c;
const ABRE_LISTA = 0x5b;
const FECHA_LISTA = 0x5d;
const ABRE_OBJETO = 0x7b;
const FECHA_OBJETO = 0x7d;
const ehEspaco = (c: number) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09;

/**
 * O que passa do teto, lido nos BYTES do JSON, antes de o JSON.parse montar
 * qualquer coisa (SN-50). Conta itens de lista e campos de objeto pelas
 * vírgulas, ignorando o que está dentro de string, e para no primeiro excesso:
 *   - o class-transformer tira campo repetido com um filtro quadrático
 *     (1 MB de `{"k0":0,...}` parava a API por 13 s, até no login sem conta);
 *   - o próprio JSON.parse de 2 MB aninhados (`[[[[...`) custava 1,5 s, e
 *     duas conexões anônimas em laço deixavam a API inutilizável.
 * Percorrer 20 MB custa ~50 ms; recusar um corpo largo, ~2 ms.
 */
export function excessoNosBytes(bytes: Uint8Array, teto: TetoDoCorpo): string | null {
  const ehLista: boolean[] = [];
  const itens: number[] = [];
  const vazio: boolean[] = [];
  let total = 0;
  let emTexto = false;
  let escapado = false;

  const algoNoAberto = () => {
    if (vazio.length > 0) vazio[vazio.length - 1] = false;
  };
  const excessoDoAberto = (quantos: number) => {
    const lista = ehLista[ehLista.length - 1];
    if (lista && quantos > teto.porLista) return `lista com mais de ${teto.porLista} itens`;
    if (!lista && quantos > teto.porObjeto) return `objeto com mais de ${teto.porObjeto} campos`;
    if (total > teto.total) return `mais de ${teto.total} itens e campos no total`;
    return null;
  };

  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (emTexto) {
      if (escapado) escapado = false;
      else if (c === BARRA) escapado = true;
      else if (c === ASPAS) emTexto = false;
      continue;
    }
    if (c === ASPAS) {
      emTexto = true;
      algoNoAberto();
    } else if (c === ABRE_LISTA || c === ABRE_OBJETO) {
      algoNoAberto();
      if (ehLista.length >= PROFUNDIDADE_MAXIMA) return `aninhamento acima de ${PROFUNDIDADE_MAXIMA} níveis`;
      ehLista.push(c === ABRE_LISTA);
      itens.push(0);
      vazio.push(true);
    } else if (c === FECHA_LISTA || c === FECHA_OBJETO) {
      if (itens.length === 0) continue;
      // O último item não tem vírgula depois: conta no fechamento
      if (!vazio[vazio.length - 1]) total++;
      const excesso = excessoDoAberto(itens[itens.length - 1] + 1);
      if (excesso && !vazio[vazio.length - 1]) return excesso;
      ehLista.pop();
      itens.pop();
      vazio.pop();
    } else if (c === VIRGULA) {
      if (itens.length === 0) continue;
      itens[itens.length - 1]++;
      total++;
      // Depois da vírgula vem mais um: já são itens + 1
      const excesso = excessoDoAberto(itens[itens.length - 1] + 1);
      if (excesso) return excesso;
    } else if (!ehEspaco(c)) {
      algoNoAberto();
    }
  }
  return null;
}

/** Erro que o body-parser repassa com o status dele (http-errors usa o `status` do erro). */
class CorpoRecusado extends Error {
  readonly status: number;
  readonly expose = true;
  readonly type = 'entity.too.large';
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * O `verify` do body-parser: roda com o corpo ainda em bytes, antes do
 * JSON.parse. `porRota`: teto próprio de um prefixo (a importação). Só UTF-8
 * (o parser aceitaria UTF-16, em que a contagem pelos bytes não vale).
 */
export function verificarAntesDoParse(padrao: TetoDoCorpo, porRota: Record<string, TetoDoCorpo> = {}) {
  const rotas = Object.entries(porRota);
  return (req: Request, _res: Response, bytes: Buffer, codificacao: string): void => {
    if (codificacao && codificacao.toLowerCase() !== 'utf-8') throw new CorpoRecusado(415, 'Envie o JSON em UTF-8');
    const teto = rotas.find(([prefixo]) => dentroDe(req, [prefixo]))?.[1] ?? padrao;
    const excesso = excessoNosBytes(bytes, teto);
    if (excesso) throw new CorpoRecusado(413, `Pedido grande demais: ${excesso}`);
  };
}

interface ErroDoParser {
  status?: number;
  statusCode?: number;
  type?: unknown;
  message?: string;
}

const CODIGO_DO_STATUS: Record<number, string> = { 400: 'BAD_REQUEST', 413: 'PAYLOAD_TOO_LARGE', 415: 'UNSUPPORTED_MEDIA_TYPE' };

/**
 * Logo depois do parser: o erro dele (corpo grande, compactado, JSON
 * malformado) sai no envelope da API em vez do formato cru do body-parser,
 * para a tela mostrar a mensagem. Erro que não é do parser segue adiante.
 */
export function erroDoParserNoEnvelope(erro: ErroDoParser, _req: Request, res: Response, next: NextFunction): void {
  const status = erro.status ?? erro.statusCode;
  const doParser = typeof erro.type === 'string' && /^(entity|encoding|charset|request)\./.test(erro.type);
  if (!doParser || !status || status < 400 || status >= 500) return next(erro);
  recusar(res, status, CODIGO_DO_STATUS[status] ?? 'BAD_REQUEST', erro.message ?? 'Pedido inválido');
}
