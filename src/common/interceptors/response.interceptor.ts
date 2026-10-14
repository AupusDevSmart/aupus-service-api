import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
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
export class ResponseInterceptor<T> implements NestInterceptor<T, Response<T> | StreamableFile> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T> | StreamableFile> {
    const requestId = uuidv4();
    const timestamp = new Date().toISOString();

    return next.handle().pipe(
      // Arquivo vai como está: embrulhado, o Nest serializava o StreamableFile
      // em JSON e todo download (anexo de OS, anomalia, equipamento, concessionária) chegava quebrado.
      map((data) => data instanceof StreamableFile ? data : ({
        success: true,
        data,
        meta: {
          timestamp,
          requestId,
        },
      })),
    );
  }
}
