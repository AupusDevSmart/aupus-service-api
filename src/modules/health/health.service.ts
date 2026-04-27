import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@aupus/api-shared';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database?: {
      status: 'connected' | 'disconnected';
      message?: string;
    };
  };
  uptime: number;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private startTime: Date;

  constructor(private readonly prisma: PrismaService) {
    this.startTime = new Date();
  }

  async checkHealth(): Promise<HealthStatus> {
    const database = await this.checkDatabaseHealth();

    const status: 'healthy' | 'unhealthy' =
      database.checks.database?.status === 'connected' ? 'healthy' : 'unhealthy';

    return {
      status,
      timestamp: new Date().toISOString(),
      checks: {
        database: database.checks.database,
      },
      uptime: Date.now() - this.startTime.getTime(),
    };
  }

  async checkDatabaseHealth(): Promise<HealthStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: {
          database: {
            status: 'connected',
            message: 'Banco de dados respondendo normalmente',
          },
        },
        uptime: Date.now() - this.startTime.getTime(),
      };
    } catch (error) {
      this.logger.error('Erro ao verificar saúde do banco:', error);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        checks: {
          database: {
            status: 'disconnected',
            message: `Erro ao conectar no banco: ${error.message}`,
          },
        },
        uptime: Date.now() - this.startTime.getTime(),
      };
    }
  }
}
