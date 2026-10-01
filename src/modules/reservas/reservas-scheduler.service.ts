import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@/core';
import { intervaloDaReserva } from './ocupacao-da-viatura';

@Injectable()
export class ReservasSchedulerService {
  private readonly logger = new Logger(ReservasSchedulerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cron: todo dia à 1h da manhã — marca reservas ativas com data_fim no passado como vencidas
   */
  @Cron('0 1 * * *')
  async handleCron(): Promise<void> {
    this.logger.log('Verificando reservas vencidas...');
    try {
      const resultado = await this.marcarReservasVencidas();
      this.logger.log(`Verificação concluída: ${resultado} reserva(s) marcada(s) como vencida(s)`);
    } catch (error) {
      this.logger.error(`Erro ao verificar reservas vencidas: ${error.message}`, error.stack);
    }
  }

  /**
   * Vence a reserva AVULSA (manual, viagem, manutenção) cujo horário já acabou.
   *
   * A de programação/OS não vence: a viatura só fica livre quando a OS é
   * executada ou cancelada (D3 da SPEC-RESERVAS-DE-VIATURA). Antes o cron
   * comparava `data_fim` (meia-noite UTC do dia) com agora e vencia a reserva
   * no próprio dia de uso, à 01:00 — a viatura passava a contar como livre e o
   * km final do Executar era descartado.
   */
  async marcarReservasVencidas(agora = new Date()): Promise<number> {
    const candidatas = await this.prisma.reserva_veiculo.findMany({
      where: {
        status: 'ativa',
        tipo_solicitante: { in: ['manual', 'viagem', 'manutencao'] },
        data_fim: { lt: agora },
      },
      select: { id: true, data_inicio: true, data_fim: true, hora_inicio: true, hora_fim: true },
    });
    const vencidas = candidatas.filter((r) => intervaloDaReserva(r).fim <= agora).map((r) => r.id);
    if (vencidas.length === 0) return 0;

    const resultado = await this.prisma.reserva_veiculo.updateMany({
      where: { id: { in: vencidas }, status: 'ativa' },
      data: { status: 'vencida' },
    });
    return resultado.count;
  }
}
