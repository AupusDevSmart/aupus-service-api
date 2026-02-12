import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

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

    // Log de queries em desenvolvimento
    if (process.env.NODE_ENV === 'develop') {
      this.$on('query' as never, (e: any) => {
        if (e.duration > 1000) {
          this.logger.warn(`Query lenta detectada (${e.duration}ms): ${e.query}`);
        }
      });
    }

    // Log de erros
    this.$on('error' as never, (e: any) => {
      this.logger.error('Prisma error:', e);
    });

    // Log de warnings
    this.$on('warn' as never, (e: any) => {
      this.logger.warn('Prisma warning:', e);
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
    await this.$disconnect();
    this.logger.log('Desconectado do banco de dados');
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