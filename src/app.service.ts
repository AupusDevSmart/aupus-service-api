import { Injectable } from '@nestjs/common';

/**
 * A raiz da API. Saúde do banco e métricas ficam no HealthController
 * (`/health`, `/health/database` públicos; alertas e métricas com
 * `sistema.monitorar`). As rotas `test-db` e `debug-sentry` saíram em
 * out/2026 (expunham contagem de usuários e disparavam erro de propósito).
 */
@Injectable()
export class AppService {
  getHello(): string {
    return 'API de Manutenção Industrial funcionando!';
  }
}
