import type { NextFunction, Request, Response } from 'express';

/**
 * Recusa o pedido grande demais PELO TAMANHO, antes do body-parser montar o
 * JSON. O limite global é de 20 MB (a importação de planilha precisa), e o
 * class-validator só confere o tamanho de uma lista depois de instanciar cada
 * item: 3 MB de `[{},{},...]` travavam a API por ~8 s com 1,6 GB de memória
 * (medido na revisão do SN-47). Rota que só recebe pedido pequeno passa por aqui.
 *
 * Sem `Content-Length` e com corpo (chunked), não há como saber o tamanho antes
 * de ler: recusa também. Navegador e axios sempre mandam o tamanho.
 */
export function limiteDoCorpo(bytes: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const declarado = req.headers['content-length'];
    const semTamanho = declarado === undefined && req.headers['transfer-encoding'] !== undefined;
    if (semTamanho || Number(declarado) > bytes) {
      res.status(413).json({
        success: false,
        error: { code: 'PAYLOAD_TOO_LARGE', message: `Pedido grande demais para esta rota (máximo ${Math.round(bytes / 1024)} kB)` },
      });
      return;
    }
    next();
  };
}
