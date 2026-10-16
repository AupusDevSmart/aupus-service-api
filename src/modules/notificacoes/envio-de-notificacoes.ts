import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@/core';

/** Quem manda o e-mail (o MailService; nos testes, um falso). */
export interface Correio {
  enviarNotificacao(destino: string, titulo: string, descricao: string, link: string | null): Promise<void>;
}
export const CORREIO = Symbol('CORREIO_DAS_NOTIFICACOES');

/** Espera antes da nova tentativa, pela tentativa que falhou: 1, 5 e 15 minutos. Na quarta falha, desiste. */
const ESPERA_MINUTOS = [1, 5, 15];
const LOTE = 50;
/** Reivindicado e sem desfecho depois disto: o processo caiu no meio do envio. */
const ENVIO_INTERROMPIDO_MS = 30 * 60_000;

/** O motivo do SMTP costuma trazer o endereço ("550 <fulano@...> rejected"): o log não leva. */
const semEnderecos = (texto: string) => texto.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<e-mail>');

/**
 * Manda os e-mails da fila (SN-47), a cada 30 s. Falhou: tenta de novo depois
 * (1, 5, 15 min) com o motivo gravado; na quarta falha fica "falhou". O envio
 * só sai de verdade com NOTIFICACOES_EMAIL=on: no dev os e-mails são de gente
 * real (cópia de produção), e o que estiver na fila fica "desligado", com o
 * porquê e um aviso no log — nunca some calado.
 *
 * Cada envio é reivindicado ("enviando") antes de sair: outro processo com o
 * mesmo banco não manda o mesmo e-mail. Se o e-mail saiu e a gravação do
 * "enviado" falhou, fica "enviando" (no log) em vez de voltar para a fila e
 * sair de novo; o que ficar "enviando" por 30 min vira "falhou", dizendo que
 * não se sabe se saiu.
 */
@Injectable()
export class EnvioDeNotificacoes {
  private readonly logger = new Logger(EnvioDeNotificacoes.name);
  private rodando = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CORREIO) private readonly correio: Correio,
  ) {}

  @Interval(30_000)
  async aCada30Segundos(): Promise<void> {
    await this.enviarPendentes(process.env.NOTIFICACOES_EMAIL === 'on').catch((e: unknown) =>
      this.logger.error(`falha na fila de e-mail das notificações: ${semEnderecos(String(e))}`),
    );
  }

  async enviarPendentes(ligado: boolean): Promise<number> {
    if (this.rodando) return 0;
    this.rodando = true;
    try {
      await this.encerrarInterrompidos();
      const fila = await this.prisma.notificacoes_envios.findMany({
        where: { status: 'pendente', canal: 'email', proxima_tentativa: { lte: new Date() } },
        orderBy: { id: 'asc' },
        take: LOTE,
        include: { notificacao: { select: { titulo: true, descricao: true, link: true } } },
      });
      if (!ligado) {
        await this.desligar(fila.map((e) => e.id));
        return fila.length;
      }
      for (const envio of fila) {
        const { count } = await this.prisma.notificacoes_envios.updateMany({
          where: { id: envio.id, status: 'pendente', proxima_tentativa: { lte: new Date() } },
          data: { status: 'enviando', proxima_tentativa: new Date() },
        });
        if (count === 0) continue;

        try {
          await this.correio.enviarNotificacao(envio.destino, envio.notificacao.titulo, envio.notificacao.descricao ?? '', envio.notificacao.link);
        } catch (erro) {
          await this.registrarFalha(envio.id, envio.notificacao_id, envio.tentativas + 1, erro);
          continue;
        }
        await this.prisma.notificacoes_envios
          .update({ where: { id: envio.id }, data: { status: 'enviado', enviado_em: new Date(), tentativas: envio.tentativas + 1, erro: null } })
          .catch((erro: unknown) =>
            this.logger.error(`e-mail ${envio.id} saiu, mas não foi marcado como enviado (fica "enviando"): ${semEnderecos(String(erro))}`),
          );
      }
      return fila.length;
    } finally {
      this.rodando = false;
    }
  }

  private async desligar(ids: bigint[]): Promise<void> {
    if (ids.length === 0) return;
    const { count } = await this.prisma.notificacoes_envios.updateMany({
      where: { id: { in: ids }, status: 'pendente' },
      data: { status: 'desligado', erro: 'envio de e-mail desligado neste ambiente (NOTIFICACOES_EMAIL)' },
    });
    this.logger.warn(`${count} e-mail(s) de notificação não enviados: NOTIFICACOES_EMAIL não está "on"`);
  }

  private async registrarFalha(id: bigint, notificacaoId: string, tentativas: number, erro: unknown): Promise<void> {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    const espera = ESPERA_MINUTOS[tentativas - 1];
    await this.prisma.notificacoes_envios.update({
      where: { id },
      data: espera
        ? { status: 'pendente', tentativas, erro: motivo, proxima_tentativa: new Date(Date.now() + espera * 60_000) }
        : { status: 'falhou', tentativas, erro: motivo },
    });
    if (!espera) this.logger.warn(`e-mail da notificação ${notificacaoId} desistiu depois de ${tentativas} tentativas: ${semEnderecos(motivo)}`);
  }

  private async encerrarInterrompidos(): Promise<void> {
    const { count } = await this.prisma.notificacoes_envios.updateMany({
      where: { status: 'enviando', proxima_tentativa: { lt: new Date(Date.now() - ENVIO_INTERROMPIDO_MS) } },
      data: { status: 'falhou', erro: 'interrompido durante o envio: não se sabe se o e-mail saiu' },
    });
    if (count > 0) this.logger.warn(`${count} e-mail(s) de notificação interrompidos no meio do envio ficaram "falhou"`);
  }
}
