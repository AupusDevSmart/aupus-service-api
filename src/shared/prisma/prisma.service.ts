import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { loggers } from '../../config/logger.config';
import { Sentry } from '../../config/sentry.config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  // Métricas de queries
  private queryMetrics = {
    totalQueries: 0,
    slowQueries: 0,
    errorCount: 0,
  };

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
      errorFormat: 'pretty',
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });

    const slowQueryThreshold = parseInt(process.env.SLOW_QUERY_THRESHOLD || '1000');

    // Monitoramento de queries
    this.$on('query' as never, (e: any) => {
      this.queryMetrics.totalQueries++;

      const duration = e.duration;
      const query = e.query;
      const params = e.params;

      // Log estruturado com Pino
      loggers.database.debug({
        query,
        params,
        duration,
        target: e.target,
      }, 'Query executada');

      // Detectar queries lentas
      if (duration > slowQueryThreshold) {
        this.queryMetrics.slowQueries++;

        loggers.database.warn({
          query,
          params,
          duration,
          threshold: slowQueryThreshold,
        }, `Query lenta detectada (${duration}ms)`);

        // Reportar query lenta ao Sentry (apenas em produção)
        if (process.env.NODE_ENV === 'production') {
          Sentry.captureMessage('Slow Database Query', {
            level: 'warning',
            extra: {
              query,
              duration,
              params,
              threshold: slowQueryThreshold,
            },
            tags: {
              component: 'database',
              query_type: 'slow',
            },
          });
        }
      }
    });

    // Log de erros
    this.$on('error' as never, (e: any) => {
      this.queryMetrics.errorCount++;

      loggers.database.error({
        error: e,
        timestamp: new Date().toISOString(),
      }, 'Erro no Prisma');

      // Reportar erro ao Sentry
      Sentry.captureException(new Error(`Prisma Error: ${e.message || JSON.stringify(e)}`), {
        level: 'error',
        extra: { details: e },
        tags: {
          component: 'database',
          error_type: 'prisma',
        },
      });
    });

    // Log de warnings
    this.$on('warn' as never, (e: any) => {
      loggers.database.warn({
        warning: e,
        timestamp: new Date().toISOString(),
      }, 'Aviso do Prisma');
    });
  }

  async onModuleInit() {
    let retries = 5;
    while (retries > 0) {
      try {
        await this.$connect();
        this.logger.log('Conectado ao banco de dados com sucesso');

        // Configurar pool de conexões para evitar timeout
        await this.$executeRaw`SELECT 1`;
        this.logger.log('Pool de conexões inicializado');

        return;
      } catch (error) {
        retries--;
        this.logger.warn(
          `Falha ao conectar ao banco de dados. Tentativas restantes: ${retries}`,
        );
        if (retries === 0) {
          this.logger.error('Não foi possível conectar ao banco de dados', error);
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  async onModuleDestroy() {
    // Log de métricas finais
    loggers.database.info({
      metrics: this.queryMetrics,
    }, 'Métricas de queries antes de desconectar');

    await this.$disconnect();
    this.logger.log('Desconectado do banco de dados');
  }

  // Método para obter métricas de queries
  getQueryMetrics() {
    return {
      ...this.queryMetrics,
      timestamp: new Date().toISOString(),
    };
  }

  // Método helper para executar queries com retry automático
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
  ): Promise<T> {
    let lastError: Error;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // P2037: Too many database connections (pool exhausted) - aguardar sem reconectar
        if (error.code === 'P2037') {
          this.logger.warn(
            `Pool de conexões esgotado (P2037). Aguardando ${(i + 1) * 2}s antes de tentar novamente... (${i + 1}/${maxRetries})`,
          );
          // Aguardar progressivamente mais tempo (2s, 4s, 6s)
          await new Promise((resolve) => setTimeout(resolve, 2000 * (i + 1)));
          continue;
        }

        // Códigos de erro que indicam problemas de conexão (reconectar)
        const reconnectionErrors = ['P1001', 'P1002', 'P1008', 'P1017'];

        if (reconnectionErrors.includes(error.code)) {
          this.logger.warn(
            `Erro de conexão detectado (${error.code}). Tentativa ${i + 1}/${maxRetries}`,
          );

          // Tentar reconectar
          try {
            await this.$disconnect();
            await this.$connect();
            this.logger.log('Reconectado ao banco de dados');
          } catch (reconnectError) {
            this.logger.error('Erro ao reconectar:', reconnectError);
          }

          // Aguardar antes de tentar novamente
          await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
          continue;
        }

        // Se não for erro de conexão, lançar imediatamente
        throw error;
      }
    }

    throw lastError!;
  }
}