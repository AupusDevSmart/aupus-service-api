import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { TransacaoEmCurso } from './transacao-em-curso';

/** Os métodos de SQL cru que a transação também tem. */
const SQL_CRU = new Set(['$executeRaw', '$executeRawUnsafe', '$queryRaw', '$queryRawUnsafe']);

/**
 * O `$transaction` de um service, quando já existe uma transação em curso:
 * vira parte dela. Postgres não aninha transação; o isolamento por registro é
 * de quem abriu a de fora (a importação usa um savepoint por registro).
 */
function transacaoAninhada(tx: Prisma.TransactionClient) {
  return async (operacoes: unknown) => {
    if (typeof operacoes === 'function') return operacoes(tx);

    const resultados: unknown[] = [];
    for (const operacao of operacoes as Array<Promise<unknown>>) {
      resultados.push(await operacao);
    }
    return resultados;
  };
}

function desviarParaTransacaoEmCurso(alvo: PrismaService, propriedade: string | symbol, receptor: unknown) {
  const emCurso = TransacaoEmCurso.atual();

  if (emCurso && typeof propriedade === 'string') {
    if (propriedade === '$transaction') return transacaoAninhada(emCurso.tx);

    const ehModel = !propriedade.startsWith('$') && !propriedade.startsWith('_');
    if ((ehModel || SQL_CRU.has(propriedade)) && propriedade in emCurso.tx) {
      const valor = (emCurso.tx as unknown as Record<string, unknown>)[propriedade];
      // Chamado como `prisma.$executeRaw(...)`, o `this` seria o PrismaService
      // e o SQL sairia pela conexão de fora da transação.
      return typeof valor === 'function' ? valor.bind(emCurso.tx) : valor;
    }
  }

  return Reflect.get(alvo, propriedade, receptor);
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  // Metricas de queries
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

    this.$on('query' as never, (e: any) => {
      this.queryMetrics.totalQueries++;
      if (e.duration > slowQueryThreshold) {
        this.queryMetrics.slowQueries++;
        this.logger.warn(`Query lenta detectada (${e.duration}ms): ${e.query}`);
      }
    });

    this.$on('error' as never, (e: any) => {
      this.queryMetrics.errorCount++;
      this.logger.error(`Erro no Prisma: ${e.message || JSON.stringify(e)}`);
    });

    this.$on('warn' as never, (e: any) => {
      this.logger.warn(`Aviso do Prisma: ${e.message || JSON.stringify(e)}`);
    });

    // Com uma transação em curso (a da importação de planilha), models, SQL
    // cru e $transaction vão para ela. Sem, tudo segue como sempre.
    return new Proxy(this, { get: desviarParaTransacaoEmCurso });
  }

  async onModuleInit() {
    let retries = 5;
    while (retries > 0) {
      try {
        await this.$connect();
        this.logger.log('Conectado ao banco de dados com sucesso');
        await this.$executeRaw`SELECT 1`;
        return;
      } catch (error) {
        retries--;
        this.logger.warn(`Falha ao conectar ao banco. Tentativas restantes: ${retries}`);
        if (retries === 0) {
          this.logger.error('Nao foi possivel conectar ao banco de dados', error);
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  async onModuleDestroy() {
    this.logger.log(`Metricas finais: ${JSON.stringify(this.queryMetrics)}`);
    await this.$disconnect();
  }

  getQueryMetrics() {
    return { ...this.queryMetrics, timestamp: new Date().toISOString() };
  }

  async executeWithRetry<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: Error;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        if (error.code === 'P2037') {
          this.logger.warn(`Pool esgotado (P2037). Aguardando ${(i + 1) * 2}s... (${i + 1}/${maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, 2000 * (i + 1)));
          continue;
        }
        const reconnectionErrors = ['P1001', 'P1002', 'P1008', 'P1017'];
        if (reconnectionErrors.includes(error.code)) {
          this.logger.warn(`Erro de conexao (${error.code}). Tentativa ${i + 1}/${maxRetries}`);
          try {
            await this.$disconnect();
            await this.$connect();
          } catch (reconnectError) {
            this.logger.error('Erro ao reconectar:', reconnectError);
          }
          await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
          continue;
        }
        throw error;
      }
    }
    throw lastError!;
  }
}
