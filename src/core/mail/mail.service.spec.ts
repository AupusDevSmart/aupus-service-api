import type { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

/**
 * A senha do SMTP só vai por conexão cifrada (revisão de segurança do SN-39).
 * Na 587 sem `secure`, o STARTTLS era oportunista: se o servidor (ou quem se
 * pusesse no meio) não o anunciasse, o login seguia em texto claro, e quem
 * pegasse a senha mandava "redefinição de senha" falsa pelo domínio real.
 */
describe('MailService: credencial do SMTP só por conexão cifrada', () => {
  const opcoesDoTransporte = (env: Record<string, string>) => {
    const criar = jest.spyOn(nodemailer, 'createTransport').mockReturnValue({} as never);
    const config = { get: (chave: string, padrao?: unknown) => env[chave] ?? padrao } as unknown as ConfigService;
    new MailService(config).onModuleInit();
    const opcoes = criar.mock.calls[0]?.[0];
    criar.mockRestore();
    return opcoes;
  };
  const smtp = { SMTP_HOST: 'smtp.teste', SMTP_USER: 'usuario', SMTP_PASS: 'senha' };

  it('porta 587 sem secure: exige o STARTTLS antes do login', () => {
    expect(opcoesDoTransporte({ ...smtp, SMTP_PORT: '587', SMTP_SECURE: 'false' })).toMatchObject({ secure: false, requireTLS: true });
  });

  it('porta 465 com secure: TLS desde a conexão', () => {
    expect(opcoesDoTransporte({ ...smtp, SMTP_PORT: '465', SMTP_SECURE: 'true' })).toMatchObject({ secure: true });
  });
});
