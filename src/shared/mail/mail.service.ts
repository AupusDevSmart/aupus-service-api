import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { getWelcomeEmailHtml } from './templates/welcome.template';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private fromAddress: string;
  private frontendUrl: string;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT', 587);
    const secure = this.configService.get<string>('SMTP_SECURE', 'false') === 'true';
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    const fromName = this.configService.get<string>('SMTP_FROM_NAME', 'Aupus');
    const fromEmail = this.configService.get<string>('SMTP_FROM_EMAIL', user || '');

    this.fromAddress = `"${fromName}" <${fromEmail}>`;
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:5173');

    if (!host || !user || !pass) {
      this.logger.warn('SMTP not configured. Emails will not be sent.');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    this.logger.log(`Mail service initialized (${host}:${port})`);
  }

  async sendWelcomeEmail(to: string, nome: string, senhaTemporaria: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`SMTP not configured. Skipping welcome email to ${to}`);
      return;
    }

    try {
      const loginUrl = `${this.frontendUrl}/login`;
      const html = getWelcomeEmailHtml(nome, senhaTemporaria, loginUrl, this.frontendUrl);

      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject: 'Bem-vindo ao Aupus - Dados de Acesso',
        html,
      });

      this.logger.log(`Welcome email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${to}: ${error.message}`);
    }
  }
}
