# 🔒 Guia de Prevenção de Múltiplas Instâncias

## ⚠️ PROBLEMA IDENTIFICADO

Entre 25-28/12/2024, houve perda de dados porque **múltiplas instâncias** do backend estavam rodando simultaneamente (servidor PM2 + backend local), causando conflitos de dados duplicados (erro P2002).

## ✅ SOLUÇÕES IMPLEMENTADAS

### 1. Upsert em vez de Create
O método `flushBuffer()` agora usa `upsert()` em vez de `create()`, evitando erros quando múltiplas instâncias tentam salvar o mesmo dado.

### 2. Logs Habilitados
Todos os logs críticos do MQTT foram habilitados para facilitar diagnóstico:
- `✅ [MQTT] Conectado com sucesso!`
- `❌ [MQTT] ERRO:`
- `🔴 [MQTT] ALERTA CRÍTICO: Broker OFFLINE!`
- `🔄 [MQTT] Reconectando ao broker...`

### 3. Variável de Ambiente MQTT_ENABLED

Adicione ao `.env`:

```bash
# PRODUÇÃO (servidor PM2)
MQTT_ENABLED=true
INSTANCE_ID=production

# DESENVOLVIMENTO (local)
MQTT_ENABLED=false
INSTANCE_ID=local-dev
```

### 4. Modificar mqtt.service.ts

Adicione esta verificação no método `connect()`:

```typescript
private async connect() {
  // ✅ Verificar se MQTT está habilitado para esta instância
  const mqttEnabled = process.env.MQTT_ENABLED !== 'false';

  if (!mqttEnabled) {
    const instanceId = process.env.INSTANCE_ID || 'unknown';
    console.log(`⏸️ [MQTT] Desabilitado para instância: ${instanceId}`);
    console.log(`⏸️ [MQTT] Dados MQTT não serão processados nesta instância`);
    return; // NÃO conectar ao MQTT
  }

  // ... resto do código de conexão
}
```

## 📋 CHECKLIST ANTES DE RODAR O BACKEND

### Em PRODUÇÃO (VPS/PM2):
- [ ] `.env` tem `MQTT_ENABLED=true`
- [ ] `.env` tem `INSTANCE_ID=production`
- [ ] PM2 está rodando
- [ ] Não há outra instância rodando

### Em DESENVOLVIMENTO (Local):
- [ ] `.env` tem `MQTT_ENABLED=false`
- [ ] `.env` tem `INSTANCE_ID=local-dev`
- [ ] Verificou que o backend de produção está rodando
- [ ] Entende que dados MQTT NÃO serão salvos localmente

## 🚨 COMO GARANTIR INSTÂNCIA ÚNICA EM PRODUÇÃO

### Opção 1: PM2 com Limite de Instâncias

```bash
# ecosystem.config.js
module.exports = {
  apps: [{
    name: 'aupus-api',
    script: 'dist/main.js',
    instances: 1, // ✅ APENAS 1 INSTÂNCIA
    exec_mode: 'fork', // ✅ NÃO cluster
    env: {
      MQTT_ENABLED: 'true',
      INSTANCE_ID: 'production'
    }
  }]
}
```

### Opção 2: Docker com Restart Policy

```yaml
# docker-compose.yml
services:
  aupus-api:
    image: aupus-api:latest
    restart: unless-stopped
    deploy:
      replicas: 1 # ✅ APENAS 1 RÉPLICA
    environment:
      - MQTT_ENABLED=true
      - INSTANCE_ID=production
```

### Opção 3: Health Check no Banco (Lock Distribuído)

Criar tabela de lock no banco:

```sql
CREATE TABLE instance_lock (
  service_name VARCHAR(50) PRIMARY KEY,
  instance_id VARCHAR(100) NOT NULL,
  locked_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);
```

Adquirir lock ao iniciar MQTT:

```typescript
async acquireLock() {
  const instanceId = process.env.INSTANCE_ID || 'unknown';

  const result = await this.prisma.$executeRaw`
    INSERT INTO instance_lock (service_name, instance_id, expires_at)
    VALUES ('mqtt-service', ${instanceId}, NOW() + INTERVAL '5 minutes')
    ON CONFLICT (service_name)
    DO UPDATE SET
      instance_id = ${instanceId},
      locked_at = NOW(),
      expires_at = NOW() + INTERVAL '5 minutes'
    WHERE instance_lock.expires_at < NOW()
    RETURNING instance_id
  `;

  if (!result || result[0]?.instance_id !== instanceId) {
    throw new Error(`Outra instância está com o lock do MQTT`);
  }
}
```

## 🎯 RECOMENDAÇÃO

**Use a Opção 1 (PM2)** por ser mais simples e eficaz:

1. Configure `MQTT_ENABLED=false` em `.env` local
2. Configure `MQTT_ENABLED=true` em `.env` produção
3. Rode `pm2 start ecosystem.config.js --only aupus-api`
4. Verifique com `pm2 list` que só há 1 instância

## ⚡ COMO TESTAR SE ESTÁ FUNCIONANDO

```bash
# No servidor de produção
pm2 logs aupus-api --lines 50 | grep MQTT

# Você deve ver:
# ✅ [MQTT] Conectado com sucesso!
# 📡 [MQTT] Carregando X tópicos MQTT...
# ✅ [MQTT] X equipamentos inscritos em Y tópicos distintos

# Se ver erros P2002, ainda há múltiplas instâncias!
```

## 📊 Monitoramento

Use os endpoints de health check:

```bash
curl http://localhost:3000/api/v1/health/mqtt
curl http://localhost:3000/api/v1/health/dados-recentes
```

---

**Data de criação:** 29/12/2024
**Autor:** Claude (com base no relatório de investigação)
