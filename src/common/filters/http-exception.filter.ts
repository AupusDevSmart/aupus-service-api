import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SentryExceptionCaptured } from '@sentry/nestjs';
import logger from '../../config/logger.config';

/**
 * O corpo de uma exceção do Nest criada com objeto: `message` é texto ou, na
 * validação, a lista das frases; `code` é o código próprio, quando há.
 */
type CorpoDaExcecao = { message?: string | unknown[]; code?: unknown };

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  @SentryExceptionCaptured()
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const requestId = uuidv4();
    const timestamp = new Date().toISOString();

    // Extrair mensagem e detalhes do erro
    let message: string | unknown[] = exception.message;
    let details: unknown[] | undefined = undefined;
    // A exceção pode trazer um código próprio (ex.: TROCAR_SENHA), que a tela usa
    let codigoProprio: string | undefined;

    if (typeof exceptionResponse === 'object') {
      const responseObj: CorpoDaExcecao = exceptionResponse;
      message = responseObj.message || message;
      if (typeof responseObj.code === 'string') codigoProprio = responseObj.code;

      // Se há array de mensagens de validação
      if (Array.isArray(responseObj.message)) {
        details = responseObj.message.map((msg: unknown) => {
          if (typeof msg === 'string') {
            return { message: msg };
          }
          return msg;
        });
      }
    }

    // Limite de tentativas (SN-38): o 429 sai do guard antes do interceptor de
    // log e não vai para o Sentry. Sem esta linha, força bruta não deixava
    // rastro. Só IP e rota: o e-mail tentado fica fora do log.
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      logger.warn({ ip: request.ip, rota: request.originalUrl, requestId }, 'Limite de tentativas');
    }

    response.status(status).json({
      success: false,
      error: {
        code: codigoProprio ?? this.getErrorCode(status),
        message,
        details,
      },
      meta: {
        timestamp,
        requestId,
      },
    });
  }

  private getErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'VALIDATION_ERROR';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'TOO_MANY_REQUESTS';
      case HttpStatus.INTERNAL_SERVER_ERROR:
        return 'INTERNAL_SERVER_ERROR';
      default:
        return 'ERROR';
    }
  }
}
