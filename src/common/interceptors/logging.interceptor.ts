import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { loggers } from '../../config/logger.config';
import { Sentry } from '../../config/sentry.config';
import { camposDoCorpo } from '../../config/sentry-sem-dados-pessoais';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, url, body, query, params, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const startTime = Date.now();

    // Criar ID único para a requisição
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    request.id = requestId;

    // Log da requisição recebida
    loggers.http.info({
      requestId,
      method,
      url,
      query,
      params,
      ip,
      userAgent,
      user: request.user?.id || 'anonymous',
    }, `Requisição recebida: ${method} ${url}`);

    return next.handle().pipe(
      tap((data) => {
        const duration = Date.now() - startTime;
        const statusCode = response.statusCode;

        // Log da resposta
        loggers.http.info({
          requestId,
          method,
          url,
          statusCode,
          duration,
          user: request.user?.id || 'anonymous',
        }, `Resposta enviada: ${method} ${url} - ${statusCode} (${duration}ms)`);

        // Alertar se a requisição demorou muito
        if (duration > 5000) {
          loggers.http.warn({
            requestId,
            method,
            url,
            duration,
          }, `Requisição lenta detectada: ${method} ${url} (${duration}ms)`);

          // Reportar ao Sentry apenas em produção
          if (process.env.NODE_ENV === 'production') {
            Sentry.captureMessage('Slow HTTP Request', {
              level: 'warning',
              extra: {
                method,
                url,
                duration,
                requestId,
              },
              tags: {
                component: 'http',
                request_type: 'slow',
              },
            });
          }
        }
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        const statusCode = error.status || 500;

        // Log do erro
        loggers.error.error({
          requestId,
          method,
          url,
          statusCode,
          duration,
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
          user: request.user?.id || 'anonymous',
        }, `Erro na requisição: ${method} ${url} - ${error.message}`);

        // Reportar erro ao Sentry
        Sentry.withScope((scope) => {
          scope.setContext('request', {
            requestId,
            method,
            url,
            query,
            params,
            // Só os nomes dos campos: o valor (senha, nome, telefone, texto livre) não sai do servidor
            campos: camposDoCorpo(body),
            duration,
          });
          scope.setUser({
            id: request.user?.id || 'anonymous',
          });
          scope.setTag('component', 'http');
          scope.setTag('http_status', statusCode);

          Sentry.captureException(error);
        });

        throw error;
      }),
    );
  }
}
