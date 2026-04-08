import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../shared/prisma/prisma.service';

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
   * Marca reservas ativas cuja data_fim já passou como vencidas.
   * Pode ser chamado via cron ou endpoint manual.
   */
  async marcarReservasVencidas(): Promise<number> {
    const agora = new Date();

    const resultado = await this.prisma.reserva_veiculo.updateMany({
      where: {
        status: 'ativa',
        data_fim: { lt: agora },
      },
      data: {
        status: 'vencida',
      },
    });

    return resultado.count;
  }
}
