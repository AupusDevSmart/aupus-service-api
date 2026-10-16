import type { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailService } from '../mail.service';
import { getNotificacaoEmailHtml, semLinksClicaveis } from './notificacao.template';

/**
 * O texto do e-mail vem do que foi digitado (título da solicitação, descrição
 * da anomalia) e sai do remetente da Aupus para gerentes e planejadores
 * (SN-47). Escapar impede HTML; o cliente de e-mail ainda faz link de qualquer
 * URL ou domínio no texto. O único link do e-mail é o botão.
 */
describe('e-mail da notificação', () => {
  it.each([
    ['revalide em https://aupus-login.exemplo.com/x', 'revalide em https[:]//aupus-login[.]exemplo[.]com/x'],
    ['acesse www.golpe.com', 'acesse www[.]golpe[.]com'],
    ['fale com fulano@empresa.com.br', 'fale com fulano@empresa[.]com[.]br'],
  ])('desarma %p', (texto, esperado) => {
    expect(semLinksClicaveis(texto)).toBe(esperado);
  });

  it.each(['Manutenção preventiva - UFV SOLAR POWER - 11/2026', 'Disjuntor 3.2 trocado, item 2.10a'])('texto comum fica igual: %p', (texto) => {
    expect(semLinksClicaveis(texto)).toBe(texto);
  });

  it('o HTML escapa e desarma; o botão leva ao registro', () => {
    const html = getNotificacaoEmailHtml('OS <b>1</b>', 'veja https://golpe.com', 'https://app.aupus/execucao-os?execucaoId=1', 'https://app.aupus');

    expect(html).toContain('OS &lt;b&gt;1&lt;/b&gt;');
    expect(html).toContain('veja https[:]//golpe[.]com');
    expect(html).not.toContain('href="https://golpe.com');
    expect(html).toContain('href="https://app.aupus/execucao-os?execucaoId=1"');
  });

  describe('link do botão', () => {
    const enviados = async (link: string | null) => {
      const sendMail = jest.fn().mockResolvedValue({});
      const criar = jest.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as never);
      const env: Record<string, string> = { SMTP_HOST: 'smtp.teste', SMTP_USER: 'u', SMTP_PASS: 'p', FRONTEND_URL: 'https://app.aupus' };
      const mail = new MailService({ get: (k: string, padrao?: unknown) => env[k] ?? padrao } as unknown as ConfigService);
      mail.onModuleInit();
      await mail.enviarNotificacao('a@b.c', 'Título', 'Descrição', link);
      criar.mockRestore();
      return sendMail.mock.calls[0][0].html as string;
    };

    it('caminho do próprio front vira o botão', async () => {
      expect(await enviados('/anomalias?anomaliaId=1')).toContain('href="https://app.aupus/anomalias?anomaliaId=1"');
    });

    it.each(['//golpe.com/x', 'https://golpe.com', 'javascript:alert(1)'])('%p não vira botão', async (link) => {
      expect(await enviados(link)).not.toContain('Abrir no Aupus Service');
    });
  });
});
