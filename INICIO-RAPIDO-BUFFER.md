# 🚀 Início Rápido - Buffer MQTT com Redis

## ✅ Passo 1: Redis já está instalado via ioredis
```bash
✓ npm install ioredis  # JÁ FEITO!
```

## 📝 Passo 2: Configurar .env

Adicione estas linhas no arquivo `.env`:

```env
# Redis para buffer MQTT (adicionar no final do arquivo)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

## 🐳 Passo 3: Iniciar Redis com Docker (RECOMENDADO)

```bash
docker run -d \
  --name redis-mqtt-buffer \
  --restart unless-stopped \
  -p 6379:6379 \
  -v redis-mqtt-data:/data \
  redis:7-alpine redis-server --appendonly yes
```

**Ou instalar localmente no Windows:**
```powershell
# Download do Redis para Windows
# https://github.com/tporadowski/redis/releases

# Ou via Chocolatey:
choco install redis-64
```

## 🔧 Passo 4: Registrar o serviço

Editar: `src/shared/mqtt/mqtt.module.ts`

```typescript
import { MqttRedisBufferService } from './mqtt-redis-buffer.service';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => EquipamentosDadosModule),
  ],
  providers: [
    MqttService,
    MqttRedisBufferService,  // ← ADICIONAR ESTA LINHA
    MqttDiagnosticsService,
  ],
  controllers: [MqttDiagnosticsController],
  exports: [
    MqttService,
    MqttRedisBufferService,  // ← ADICIONAR ESTA LINHA
    MqttDiagnosticsService,
  ],
})
export class MqttModule {}
```

## 🔌 Passo 5: Integrar no MqttService

Editar: `src/shared/mqtt/mqtt.service.ts`

**1. Adicionar import no topo:**
```typescript
import { MqttRedisBufferService } from './mqtt-redis-buffer.service';
```

**2. Injetar no constructor:**
```typescript
constructor(
  private readonly prisma: PrismaService,
  @Inject(forwardRef(() => MqttIngestionService))
  private readonly mqttIngestionService: MqttIngestionService,
  private readonly redisBuffer: MqttRedisBufferService,  // ← ADICIONAR
) {
  super();
  this.ajv = new Ajv({ allErrors: true });
  addFormats(this.ajv);
}
```

**3. Proteger o método `salvarDadosM160Resumo` (linha ~662):**

Localizar este bloco:
```typescript
// PRODUÇÃO: Salvar diretamente no banco (sem buffer)
await this.prisma.equipamentos_dados.upsert({
  where: {
    uk_equipamento_timestamp: {
      equipamento_id: equipamentoId,
      timestamp_dados: timestampDados,
    },
  },
  update: { /* ... */ },
  create: { /* ... */ },
});
```

Substituir por:
```typescript
// PRODUÇÃO: Salvar com proteção de buffer
try {
  await this.prisma.equipamentos_dados.upsert({
    where: {
      uk_equipamento_timestamp: {
        equipamento_id: equipamentoId,
        timestamp_dados: timestampDados,
      },
    },
    update: {
      dados: dadosProcessados as any,
      fonte: 'MQTT',
      timestamp_fim: timestampDados,
      num_leituras: resumo.total_leituras || 1,
      qualidade: qualidadeReal,
      potencia_ativa_kw: potenciaMediaKw,
      energia_kwh: energiaKwh,
    },
    create: {
      equipamento_id: equipamentoId,
      dados: dadosProcessados as any,
      fonte: 'MQTT',
      timestamp_dados: timestampDados,
      timestamp_fim: timestampDados,
      num_leituras: resumo.total_leituras || 1,
      qualidade: qualidadeReal,
      potencia_ativa_kw: potenciaMediaKw,
      energia_kwh: energiaKwh,
    },
  });
} catch (dbError) {
  // ❌ BANCO FALHOU → Salvar no Redis Buffer
  console.error(`❌ [M-160] Banco falhou, usando buffer Redis:`, dbError.message);

  await this.redisBuffer.salvarNoBuffer(
    equipamentoId,
    timestampDados,
    { Resumo: resumo }, // Manter estrutura original
  );
}
```

**4. Proteger o método `flushBuffer` (linha ~849):**

Localizar:
```typescript
await this.prisma.equipamentos_dados.upsert({
  where: { /* ... */ },
  update: { /* ... */ },
  create: { /* ... */ },
});
```

Substituir por:
```typescript
try {
  await this.prisma.equipamentos_dados.upsert({
    where: {
      uk_equipamento_timestamp: {
        equipamento_id: equipamentoId,
        timestamp_dados: buffer.timestamp_inicio,
      },
    },
    update: { /* ... campos existentes ... */ },
    create: { /* ... campos existentes ... */ },
  });

  // ✅ Sucesso - limpar buffer
  buffer.leituras = [];
  buffer.timestamp_inicio = new Date();

} catch (dbError) {
  // ❌ BANCO FALHOU → Salvar no Redis Buffer
  console.error(`❌ [INVERSOR] Banco falhou, usando buffer Redis:`, dbError.message);

  // Salvar agregado no buffer
  await this.redisBuffer.salvarNoBuffer(
    equipamentoId,
    buffer.timestamp_inicio,
    dadosAgregados,
  );

  // Limpar buffer local (dados seguros no Redis)
  buffer.leituras = [];
  buffer.timestamp_inicio = new Date();
}
```

## 🧪 Passo 6: Testar

### 1. Verificar Redis está rodando
```bash
docker ps | grep redis-mqtt-buffer
```

### 2. Iniciar o backend
```bash
npm run start:dev
```

### 3. Ver logs do buffer
Procure por mensagens como:
```
✅ Redis conectado!
🟢 Redis pronto para uso!
🔄 [REDIS BUFFER] Processando dados pendentes...
```

### 4. Simular falha do banco
```bash
# Parar PostgreSQL
docker stop postgres-container
```

### 5. Ver dados sendo salvos no buffer
```bash
# Conectar no Redis
docker exec -it redis-mqtt-buffer redis-cli

# Ver quantidade na fila
LLEN mqtt:buffer:queue

# Ver estatísticas
HGETALL mqtt:buffer:stats

# Ver primeiro dado (sem remover)
LINDEX mqtt:buffer:queue 0
```

### 6. Religar banco e ver processamento
```bash
# Iniciar PostgreSQL
docker start postgres-container

# Logs devem mostrar:
# ✅ [REDIS BUFFER] Processado: cmllgigy800cujqctbxnx1iq5 @ 2026-03-10...
```

## 📊 Monitoramento

### Endpoint de Estatísticas
```bash
curl http://localhost:3000/mqtt-diagnostics/buffer/stats
```

Resposta:
```json
{
  "success": true,
  "data": {
    "pendentes": 0,
    "falhados": 0,
    "totalBuffered": 150,
    "totalSaved": 150,
    "totalFailed": 0,
    "totalSkipped": 0,
    "redis": "online",
    "processando": false
  }
}
```

## 🔍 Verificar se está funcionando

### Logs que indicam sucesso:
```
✅ Redis conectado!
🟢 Redis pronto para uso!
⏰ [REDIS BUFFER] Retry automático ativado (30s)
```

### Logs quando banco falha:
```
❌ [M-160] Banco falhou, usando buffer Redis: Connection refused
💾 [REDIS BUFFER] Dados salvos: cmllgigy800cujqctbxnx1iq5 @ ... (Fila: 1)
```

### Logs quando processando:
```
🔄 [REDIS BUFFER] Processando 100 de 150 dados pendentes...
✅ [REDIS BUFFER] Processado: cmllgigy800cujqctbxnx1iq5 @ ...
📊 [REDIS BUFFER] Lote processado: 100 sucessos, 0 falhas, 50 pendentes
```

## ⚠️ Troubleshooting

### Redis não conecta
```bash
# Verificar se está rodando
docker ps -a | grep redis

# Ver logs
docker logs redis-mqtt-buffer

# Testar conexão
docker exec -it redis-mqtt-buffer redis-cli ping
# Deve responder: PONG
```

### Dados não são processados
```bash
# Forçar processamento manual
curl -X POST http://localhost:3000/mqtt-diagnostics/buffer/forcar-processamento
```

### Ver dados no Redis
```bash
# Conectar
docker exec -it redis-mqtt-buffer redis-cli

# Ver todas as keys
KEYS mqtt:*

# Ver tamanho da fila
LLEN mqtt:buffer:queue

# Ver um dado específico
LINDEX mqtt:buffer:queue 0
```

## ✅ Pronto!

Agora seu sistema está protegido contra perda de dados MQTT! 🎉

**Próximos passos:**
- Monitorar logs por alguns dias
- Ajustar `BATCH_SIZE` se necessário (padrão: 100)
- Ajustar `RETRY_INTERVAL` se necessário (padrão: 30s)
- Configurar alertas para quando `pendentes > 1000`
