# Sistema de Monitoramento e Logging

Este documento descreve como está configurado o sistema de monitoramento, logging e medição de performance da aplicação.

## 📊 Componentes Implementados

### 1. Sentry - Monitoramento de Erros
- **Descrição**: Captura e rastreia erros e exceções em tempo real
- **Configuração**: `src/config/sentry.config.ts`
- **Features**:
  - Rastreamento automático de exceções
  - Performance monitoring de requisições HTTP
  - CPU Profiling
  - Filtro de informações sensíveis (passwords, tokens, etc)
  - Contexto de usuário e requisição

### 2. Pino - Sistema de Logging Estruturado
- **Descrição**: Logger de alta performance com logs estruturados em JSON
- **Configuração**: `src/config/logger.config.ts`
- **Features**:
  - Pretty print colorizado em desenvolvimento
  - JSON estruturado em produção
  - Logs categorizados (HTTP, Database, Auth, Business, Error)
  - Performance otimizada

### 3. Instrumentação de Queries (Prisma)
- **Descrição**: Medição e análise de performance de queries do banco
- **Configuração**: `src/shared/prisma/prisma.service.ts`
- **Features**:
  - Detecção automática de queries lentas
  - Métricas de queries (total, lentas, erros)
  - Logging estruturado de todas as queries
  - Alertas ao Sentry para queries críticas

### 4. Interceptor de Logging HTTP
- **Descrição**: Rastreamento de todas as requisições HTTP
- **Configuração**: `src/common/interceptors/logging.interceptor.ts`
- **Features**:
  - Log de requisições e respostas
  - Medição de tempo de resposta
  - Detecção de requisições lentas (>5s)
  - Sanitização de dados sensíveis

## 🚀 Configuração

### Variáveis de Ambiente

Adicione as seguintes variáveis ao seu arquivo `.env`:

```env
# === SENTRY (Monitoramento de Erros) ===
# Obtenha seu DSN em: https://sentry.io/
SENTRY_DSN="https://your-sentry-dsn@sentry.io/project-id"

# === LOGGING ===
# Nível de log: debug, info, warn, error
LOG_LEVEL="info"

# === MONITORAMENTO DE PERFORMANCE ===
# Threshold para detectar queries lentas (em milissegundos)
SLOW_QUERY_THRESHOLD=1000

# === AMBIENTE ===
NODE_ENV="production"  # ou "development"
```

### Como obter o Sentry DSN

1. Acesse [sentry.io](https://sentry.io/)
2. Crie uma conta ou faça login
3. Crie um novo projeto do tipo "Node.js"
4. Copie o DSN fornecido
5. Cole no arquivo `.env`

## 📈 Endpoints de Monitoramento

### Métricas de Queries do Banco

```bash
GET /api/v1/health/metrics/database
```

Retorna:
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

### Health Check Geral

```bash
GET /api/v1/health
```

## 🔍 Uso dos Loggers

### Logger HTTP
```typescript
import { loggers } from '@/config/logger.config';

// Log de requisição
loggers.http.info({
  method: 'GET',
  url: '/api/users',
  statusCode: 200,
  duration: 45,
}, 'Requisição processada');
```

### Logger de Database
```typescript
import { loggers } from '@/config/logger.config';

// Log de query
loggers.database.warn({
  query: 'SELECT * FROM users WHERE...',
  duration: 1200,
}, 'Query lenta detectada');
```

### Logger de Autenticação
```typescript
import { loggers } from '@/config/logger.config';

loggers.auth.info({
  userId: user.id,
  email: user.email,
}, 'Usuário autenticado com sucesso');
```

### Logger de Business Logic
```typescript
import { loggers } from '@/config/logger.config';

loggers.business.info({
  orderId: order.id,
  amount: order.total,
}, 'Pedido criado');
```

### Logger de Erros
```typescript
import { loggers } from '@/config/logger.config';

loggers.error.error({
  error: error.message,
  stack: error.stack,
}, 'Erro ao processar pedido');
```

## 🎯 Reportar Erros Manualmente ao Sentry

### Capturar Exceção
```typescript
import { Sentry } from '@/config/sentry.config';

try {
  // seu código
} catch (error) {
  Sentry.captureException(error, {
    level: 'error',
    extra: {
      userId: user.id,
      context: 'payment-processing',
    },
    tags: {
      component: 'payment',
      payment_method: 'credit_card',
    },
  });
}
```

### Capturar Mensagem
```typescript
import { Sentry } from '@/config/sentry.config';

Sentry.captureMessage('Operação crítica executada', {
  level: 'warning',
  extra: {
    details: 'informações adicionais',
  },
  tags: {
    component: 'business',
  },
});
```

## 📊 Boas Práticas

### 1. Níveis de Log

- **DEBUG**: Informações detalhadas para debug (apenas em desenvolvimento)
- **INFO**: Eventos importantes do sistema (login, criação de recursos)
- **WARN**: Situações anormais mas não críticas (query lenta, retry)
- **ERROR**: Erros que precisam atenção (exceções, falhas)

### 2. Logs Estruturados

Sempre use objetos estruturados ao invés de strings concatenadas:

```typescript
// ✅ BOM
loggers.http.info({
  method: 'POST',
  url: '/users',
  statusCode: 201,
  duration: 45,
}, 'Usuário criado');

// ❌ RUIM
loggers.http.info(`Usuário criado - POST /users - 201 - 45ms`);
```

### 3. Sanitização de Dados Sensíveis

Nunca logue:
- Senhas
- Tokens
- Dados de cartão de crédito
- Informações pessoais sensíveis

O sistema já sanitiza automaticamente alguns campos, mas sempre revise seus logs.

### 4. Performance

- Configure `SLOW_QUERY_THRESHOLD` adequadamente para seu caso
- Em produção, use `LOG_LEVEL="info"` para reduzir volume de logs
- Configure `tracesSampleRate` no Sentry para controlar volume de traces

### 5. Monitoramento em Produção

1. **Configure alertas no Sentry** para erros críticos
2. **Monitore métricas de queries** regularmente via `/health/metrics/database`
3. **Revise queries lentas** e otimize quando necessário
4. **Acompanhe logs** usando ferramentas de agregação (ex: ELK, Datadog)

## 🔧 Troubleshooting

### Sentry não está capturando erros

1. Verifique se `SENTRY_DSN` está configurado corretamente
2. Confirme que `NODE_ENV` está setado
3. Verifique os logs de inicialização: `✅ Sentry inicializado`

### Logs não aparecem

1. Verifique `LOG_LEVEL` no `.env`
2. Em desenvolvimento, certifique-se que o terminal suporta cores
3. Em produção, logs são em JSON - use um parser

### Queries não são marcadas como lentas

1. Ajuste `SLOW_QUERY_THRESHOLD` para um valor menor
2. Verifique se o Prisma está configurado corretamente
3. Confirme que as queries estão realmente demorando mais que o threshold

## 📚 Referências

- [Sentry Node.js Documentation](https://docs.sentry.io/platforms/node/)
- [Pino Documentation](https://getpino.io/)
- [Prisma Logging](https://www.prisma.io/docs/concepts/components/prisma-client/logging)
- [NestJS Logging](https://docs.nestjs.com/techniques/logger)
