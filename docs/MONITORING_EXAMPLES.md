# Exemplos de Uso do Sistema de Monitoramento

Este documento contém exemplos práticos de como usar o sistema de monitoramento no dia a dia.

## 🎯 MonitoringHelper - Uso Básico

### Exemplo 1: Monitorar Operação de Negócio

```typescript
import { MonitoringHelper } from '@/common/helpers/monitoring.helper';

class PlantasService {
  async criarPlanta(data: CreatePlantaDto) {
    return MonitoringHelper.withMonitoring(
      'criar-planta',
      async () => {
        // Sua lógica aqui
        const planta = await this.prisma.planta.create({
          data,
        });
        return planta;
      },
      {
        // Contexto adicional para debugging
        nomeCliente: data.nomeCliente,
        tipo: data.tipo,
      },
    );
  }
}
```

**O que acontece automaticamente:**
- Log do início da operação
- Medição de tempo de execução
- Log do resultado (sucesso ou erro)
- Captura de exceções no Sentry
- Alerta se a operação demorar >5s

### Exemplo 2: Log de Eventos de Negócio

```typescript
import { MonitoringHelper } from '@/common/helpers/monitoring.helper';

class ManutencaoService {
  async iniciarManutencao(planoId: string, usuarioId: string) {
    // ... lógica de iniciar manutenção

    // Registrar evento importante
    MonitoringHelper.logBusinessEvent('manutencao-iniciada', {
      planoId,
      usuarioId,
      tipo: plano.tipo,
      prioridade: plano.prioridade,
    });

    // Evento crítico (também vai para o Sentry em produção)
    if (plano.prioridade === 'URGENTE') {
      MonitoringHelper.logBusinessEvent(
        'manutencao-urgente-iniciada',
        { planoId, usuarioId },
        'warn',
      );
    }
  }
}
```

### Exemplo 3: Rastrear Métricas Customizadas

```typescript
import { MonitoringHelper } from '@/common/helpers/monitoring.helper';

class RelatoriosService {
  async gerarRelatorio(tipo: string) {
    const inicio = Date.now();

    const dados = await this.buscarDados(tipo);
    const relatorio = await this.processar(dados);

    // Rastrear métricas
    MonitoringHelper.trackMetric(
      'registros-processados',
      dados.length,
      'registros',
      { tipo_relatorio: tipo },
    );

    MonitoringHelper.trackMetric(
      'tamanho-relatorio',
      relatorio.size,
      'KB',
      { tipo_relatorio: tipo },
    );

    return relatorio;
  }
}
```

### Exemplo 4: Log de Controle de Acesso

```typescript
import { MonitoringHelper } from '@/common/helpers/monitoring.helper';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const resource = request.path;
    const action = request.method;

    const hasPermission = this.checkPermission(user, resource, action);

    // Registrar tentativa de acesso
    MonitoringHelper.logAccess(
      user.id,
      resource,
      action,
      hasPermission,
    );

    return hasPermission;
  }
}
```

## 📊 Uso Direto dos Loggers

### Logger HTTP - Requisições

```typescript
import { loggers } from '@/config/logger.config';

@Controller('plantas')
export class PlantasController {
  @Get(':id')
  async findOne(@Param('id') id: string) {
    loggers.http.debug(
      { plantaId: id },
      'Buscando planta por ID',
    );

    const planta = await this.plantasService.findOne(id);

    if (!planta) {
      loggers.http.warn(
        { plantaId: id },
        'Planta não encontrada',
      );
      throw new NotFoundException();
    }

    return planta;
  }
}
```

### Logger Database - Queries Customizadas

```typescript
import { loggers } from '@/config/logger.config';

class RelatoriosService {
  async executarQueryComplexa() {
    loggers.database.info('Executando query complexa de relatório');

    const startTime = Date.now();
    const result = await this.prisma.$queryRaw`
      SELECT ... FROM ... WHERE ...
    `;
    const duration = Date.now() - startTime;

    loggers.database.info(
      {
        query: 'relatorio-complexo',
        duration,
        rows: result.length,
      },
      `Query executada: ${duration}ms, ${result.length} linhas`,
    );

    return result;
  }
}
```

### Logger Auth - Autenticação

```typescript
import { loggers } from '@/config/logger.config';

class AuthService {
  async login(email: string, senha: string) {
    loggers.auth.info(
      { email },
      'Tentativa de login',
    );

    const user = await this.validateUser(email, senha);

    if (!user) {
      loggers.auth.warn(
        { email },
        'Falha de autenticação: credenciais inválidas',
      );
      throw new UnauthorizedException();
    }

    loggers.auth.info(
      {
        userId: user.id,
        email: user.email,
      },
      'Login bem-sucedido',
    );

    return this.generateToken(user);
  }

  async logout(userId: string) {
    loggers.auth.info(
      { userId },
      'Usuário deslogado',
    );
  }
}
```

### Logger Business - Lógica de Negócio

```typescript
import { loggers } from '@/config/logger.config';

class PagamentosService {
  async processarPagamento(pedidoId: string, valor: number) {
    loggers.business.info(
      {
        pedidoId,
        valor,
      },
      'Processando pagamento',
    );

    try {
      const resultado = await this.gateway.processar(pedidoId, valor);

      if (resultado.status === 'aprovado') {
        loggers.business.info(
          {
            pedidoId,
            valor,
            transacaoId: resultado.transacaoId,
          },
          'Pagamento aprovado',
        );
      } else {
        loggers.business.warn(
          {
            pedidoId,
            valor,
            motivo: resultado.motivo,
          },
          'Pagamento recusado',
        );
      }

      return resultado;
    } catch (error) {
      loggers.business.error(
        {
          pedidoId,
          valor,
          error: error.message,
        },
        'Erro ao processar pagamento',
      );
      throw error;
    }
  }
}
```

### Logger Error - Tratamento de Erros

```typescript
import { loggers } from '@/config/logger.config';
import { Sentry } from '@/config/sentry.config';

class IntegracaoService {
  async sincronizarDados() {
    try {
      await this.api.sync();
    } catch (error) {
      // Log detalhado do erro
      loggers.error.error(
        {
          servico: 'integracao-externa',
          error: {
            message: error.message,
            stack: error.stack,
            code: error.code,
          },
          tentativa: this.tentativas,
        },
        'Erro na sincronização de dados',
      );

      // Enviar ao Sentry com contexto
      Sentry.withScope((scope) => {
        scope.setContext('integracao', {
          servico: 'api-externa',
          tentativa: this.tentativas,
        });
        scope.setTag('component', 'integration');
        Sentry.captureException(error);
      });

      throw error;
    }
  }
}
```

## 🎯 Reportar ao Sentry Manualmente

### Capturar Exceção

```typescript
import { Sentry } from '@/config/sentry.config';

try {
  await operacaoCritica();
} catch (error) {
  Sentry.captureException(error, {
    level: 'error',
    extra: {
      userId: user.id,
      operation: 'operacao-critica',
      data: requestData,
    },
    tags: {
      component: 'business',
      criticality: 'high',
    },
  });
  throw error;
}
```

### Capturar Mensagem

```typescript
import { Sentry } from '@/config/sentry.config';

// Situação anormal mas não é erro
if (tentativas > 3) {
  Sentry.captureMessage('Muitas tentativas de retry', {
    level: 'warning',
    extra: {
      operacao: 'sync-dados',
      tentativas,
      maxTentativas: 3,
    },
    tags: {
      component: 'integration',
      type: 'retry',
    },
  });
}
```

### Adicionar Contexto ao Sentry

```typescript
import { Sentry } from '@/config/sentry.config';

// Adicionar usuário
Sentry.setUser({
  id: user.id,
  email: user.email,
  username: user.nome,
});

// Adicionar contexto customizado
Sentry.setContext('pedido', {
  id: pedido.id,
  valor: pedido.total,
  status: pedido.status,
});

// Adicionar tags
Sentry.setTag('payment_method', 'credit_card');
Sentry.setTag('environment', 'production');
```

## 📈 Exemplo Completo - Service

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/shared/prisma/prisma.service';
import { MonitoringHelper } from '@/common/helpers/monitoring.helper';
import { loggers } from '@/config/logger.config';
import { Sentry } from '@/config/sentry.config';

@Injectable()
export class PlantasService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreatePlantaDto, userId: string) {
    return MonitoringHelper.withMonitoring(
      'criar-planta',
      async () => {
        // Validação de negócio
        const clienteExiste = await this.prisma.cliente.findUnique({
          where: { id: data.clienteId },
        });

        if (!clienteExiste) {
          loggers.business.warn(
            {
              clienteId: data.clienteId,
              userId,
            },
            'Tentativa de criar planta para cliente inexistente',
          );
          throw new NotFoundException('Cliente não encontrado');
        }

        // Criar planta
        const planta = await this.prisma.planta.create({
          data: {
            ...data,
            criadoPor: userId,
          },
        });

        // Registrar evento
        MonitoringHelper.logBusinessEvent('planta-criada', {
          plantaId: planta.id,
          clienteId: data.clienteId,
          userId,
        });

        // Rastrear métrica
        MonitoringHelper.trackMetric('plantas-criadas', 1, 'unidade', {
          cliente: data.clienteId,
        });

        return planta;
      },
      {
        clienteId: data.clienteId,
        userId,
      },
    );
  }

  async syncWithExternalApi(plantaId: string) {
    loggers.business.info(
      { plantaId },
      'Iniciando sincronização com API externa',
    );

    try {
      const result = await this.externalApi.sync(plantaId);

      loggers.business.info(
        {
          plantaId,
          registrosSincronizados: result.count,
        },
        'Sincronização concluída',
      );

      MonitoringHelper.trackMetric(
        'registros-sincronizados',
        result.count,
        'registros',
        { planta: plantaId },
      );

      return result;
    } catch (error) {
      loggers.error.error(
        {
          plantaId,
          error: error.message,
        },
        'Erro na sincronização',
      );

      Sentry.withScope((scope) => {
        scope.setContext('sync', {
          plantaId,
          api: 'external-api',
        });
        scope.setTag('component', 'integration');
        Sentry.captureException(error);
      });

      throw error;
    }
  }
}
```

## 🔍 Consultar Métricas

### Endpoint de Métricas do Banco

```bash
curl http://localhost:3001/api/v1/health/metrics/database
```

Resposta:
```json
{
  "database": {
    "totalQueries": 1523,
    "slowQueries": 12,
    "errorCount": 0,
    "timestamp": "2024-01-15T10:30:00.000Z"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## 💡 Dicas

1. **Use `MonitoringHelper.withMonitoring`** para operações críticas
2. **Log eventos importantes** com `logBusinessEvent`
3. **Rastreie métricas customizadas** para análise futura
4. **Use níveis de log apropriados**: debug < info < warn < error
5. **Adicione contexto rico** aos logs e erros do Sentry
6. **Sanitize dados sensíveis** antes de logar
