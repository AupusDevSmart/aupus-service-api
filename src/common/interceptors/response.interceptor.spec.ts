import { CallHandler, ExecutionContext, StreamableFile } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { Readable } from 'stream';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor();
  const passar = (valor: unknown) =>
    lastValueFrom(interceptor.intercept({} as ExecutionContext, { handle: () => of(valor) } as CallHandler));

  it('embrulha a resposta comum em { success, data, meta }', async () => {
    const r = await passar({ id: 1 });
    expect(r).toMatchObject({ success: true, data: { id: 1 } });
  });

  it('arquivo passa intacto: embrulhado, o download virava JSON (e mostrava o caminho do arquivo no servidor)', async () => {
    const arquivo = new StreamableFile(Readable.from(['conteudo']));
    expect(await passar(arquivo)).toBe(arquivo);
  });
});
