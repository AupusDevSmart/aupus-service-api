import { ArgumentsHost, ForbiddenException, NotFoundException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  const responder = (excecao: ForbiddenException | NotFoundException) => {
    const json = jest.fn();
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status: () => ({ json }) }), getRequest: () => ({}) }),
    } as unknown as ArgumentsHost;
    new HttpExceptionFilter().catch(excecao, host);
    return json.mock.calls[0][0].error;
  };

  it('mantém o código próprio da exceção (a tela reconhece TROCAR_SENHA)', () => {
    expect(responder(new ForbiddenException({ code: 'TROCAR_SENHA', message: 'Troque a senha' }))).toMatchObject({
      code: 'TROCAR_SENHA',
      message: 'Troque a senha',
    });
  });

  it('sem código próprio, o código do status', () => {
    expect(responder(new NotFoundException('Não encontrado')).code).toBe('NOT_FOUND');
  });
});
