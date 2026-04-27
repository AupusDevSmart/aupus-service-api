import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HealthService } from './health.service';

export interface Alert {
  level: 'INFO' | 'WARNING' | 'CRITICAL';
  service: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  private lastAlertState: {
    database: 'ok' | 'critical' | null;
  } = {
    database: null,
  };

  private alertHistory: Alert[] = [];
  private readonly MAX_HISTORY = 100;

  constructor(private readonly healthService: HealthService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkSystemHealthAndAlert() {
    this.logger.log('Executando verificacao automatica de saude...');

    try {
      const health = await this.healthService.checkHealth();
      await this.checkDatabaseStatus(health);
      this.logger.log(`Verificacao completa. Status geral: ${health.status}`);
    } catch (error) {
      this.logger.error('Erro ao executar verificacao de saude:', error);
      await this.sendAlert({
        level: 'CRITICAL',
        service: 'HealthCheck',
        message: `Erro ao executar health check: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async checkDatabaseStatus(health: any) {
    const dbStatus = health.checks.database?.status;
    const currentState = dbStatus === 'connected' ? 'ok' : 'critical';

    if (this.lastAlertState.database !== currentState) {
      if (currentState === 'critical') {
        await this.sendAlert({
          level: 'CRITICAL',
          service: 'Database',
          message: 'BANCO DE DADOS OFFLINE. Sistema inoperante.',
          timestamp: new Date().toISOString(),
          metadata: {
            message: health.checks.database?.message,
          },
        });
      } else {
        await this.sendAlert({
          level: 'INFO',
          service: 'Database',
          message: 'Banco de dados reconectado.',
          timestamp: new Date().toISOString(),
        });
      }

      this.lastAlertState.database = currentState;
    }
  }

  private async sendAlert(alert: Alert) {
    this.alertHistory.unshift(alert);
    if (this.alertHistory.length > this.MAX_HISTORY) {
      this.alertHistory = this.alertHistory.slice(0, this.MAX_HISTORY);
    }

    const logMethod = {
      INFO: 'log',
      WARNING: 'warn',
      CRITICAL: 'error',
    };

    this.logger[logMethod[alert.level]](
      `[${alert.service}] ${alert.message}`,
      alert.metadata || '',
    );
  }

  getAlertHistory(): Alert[] {
    return this.alertHistory;
  }

  async triggerManualCheck() {
    this.logger.log('Verificacao manual solicitada...');
    await this.checkSystemHealthAndAlert();
  }
}
