import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@/core';

/** Quanto tempo o registro operacional fica: o bastante para investigar um aviso que não chegou. */
export const DIAS_DE_GUARDA = 90;

/**
 * Apaga, todo dia às 4h15, o que só serve para operar a fila (SN-47): eventos
 * já processados e e-mails já resolvidos (enviado, desligado, falhou) com mais
 * de 90 dias. O e-mail guarda uma cópia do endereço, que não fica para sempre
 * (LGPD). A notificação em si fica: é o histórico do sininho de cada um.
 */
@Injectable()
export class LimpezaDeNotificacoes {
  private readonly logger = new Logger(LimpezaDeNotificacoes.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('15 4 * * *')
  async todoDia(): Promise<void> {
    await this.limpar().catch((e: unknown) => this.logger.error(`falha na limpeza das notificações: ${String(e)}`));
  }

  async limpar(agora = new Date()): Promise<{ eventos: number; envios: number }> {
    const limite = new Date(agora.getTime() - DIAS_DE_GUARDA * 86_400_000);
    const eventos = await this.prisma.notificacoes_eventos.deleteMany({ where: { processado_em: { lt: limite } } });
    const envios = await this.prisma.notificacoes_envios.deleteMany({
      where: { status: { in: ['enviado', 'desligado', 'falhou'] }, criado_em: { lt: limite } },
    });
    if (eventos.count + envios.count > 0) {
      this.logger.log(`limpeza das notificações: ${eventos.count} evento(s) e ${envios.count} e-mail(s) com mais de ${DIAS_DE_GUARDA} dias`);
    }
    return { eventos: eventos.count, envios: envios.count };
  }
}
