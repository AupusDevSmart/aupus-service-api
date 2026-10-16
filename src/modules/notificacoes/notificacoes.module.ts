import { Module } from '@nestjs/common';
import { MailService } from '../../core/mail/mail.service';
import { CORREIO, EnvioDeNotificacoes } from './envio-de-notificacoes';
import { NotificacoesController } from './notificacoes.controller';
import { NotificacoesService } from './notificacoes.service';
import { ProcessadorDeNotificacoes } from './processador-de-notificacoes';
import { LimpezaDeNotificacoes } from './limpeza-de-notificacoes';

/** Notificação de mudança de status (SN-47): o sininho, o processador, a fila de e-mail e a limpeza. */
@Module({
  controllers: [NotificacoesController],
  providers: [
    NotificacoesService,
    ProcessadorDeNotificacoes,
    EnvioDeNotificacoes,
    LimpezaDeNotificacoes,
    { provide: CORREIO, useExisting: MailService },
  ],
})
export class NotificacoesModule {}
