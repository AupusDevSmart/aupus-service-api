import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

export interface Response<T> {
  success: boolean;
  data: T;
  meta: {
    timestamp: string;
    requestId: string;
  };
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    const requestId = uuidv4();
    const timestamp = new Date().toISOString();

    return next.handle().pipe(
      map((data) => {
        // Se a resposta já tem estrutura com success, data, meta, retorna como está
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }

        // Caso contrário, envolve com a estrutura padrão
        return {
          success: true,
          data,
          meta: {
            timestamp,
            requestId,
          },
        };
      }),
    );
  }
}
