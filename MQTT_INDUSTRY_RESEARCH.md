# 🔍 Pesquisa: Como a Indústria Lida com MQTT em Múltiplas Instâncias

**Data:** 29/12/2024
**Contexto:** Avaliação da solução atual (3 modos) vs padrões de mercado

---

## 📊 Resumo Executivo

Sua preocupação sobre a solução de 3 modos ("não sei se no longo prazo isso vai funcionar") é **válida e compartilhada pela indústria**.

A pesquisa revelou que empresas e projetos open-source de ponta adotam abordagens **muito mais robustas** do que simplesmente desabilitar MQTT em desenvolvimento. Veja a análise:

---

## 🏭 Padrões da Indústria (2024-2025)

### 1️⃣ **MQTT Shared Subscriptions (Padrão Ouro)**

#### O Que É?
Introduzido no MQTT 5.0, permite que **múltiplas instâncias** compartilhem a mesma subscrição, distribuindo mensagens entre elas automaticamente.

#### Como Funciona?
```
MQTT Broker
    │
    ├─> $share/group1/equipamentos/#
    │       ├─> Instância 1 (VPS) ───> 50% das mensagens
    │       └─> Instância 2 (Local) ──> 50% das mensagens
    │
    └─> Distribuição automática pelo broker
```

#### Estratégias de Balanceamento:
- **Round Robin** (padrão): Alterna entre instâncias
- **Random**: Distribuição aleatória
- **Least Inflight**: Prioriza instância com menos mensagens pendentes
- **Local First**: Prioriza subscribers no mesmo nó do cluster

#### Casos de Uso Reais:
- **EMQX**: Suporta 100 milhões de conexões simultâneas em cluster
- **HiveMQ**: Usado em soluções enterprise com alta disponibilidade
- **Caso Ecler (2024)**: Plataforma IoT para amplificadores conectados usando shared subscriptions

#### Vantagens:
✅ Múltiplas instâncias processam dados simultaneamente (escalabilidade real)
✅ Tolerância a falhas (se uma instância cai, broker redistribui automaticamente)
✅ Suporta QoS 1 e 2 (at-least-once e exactly-once delivery)
✅ Sem conflitos de dados (broker garante que cada mensagem vai para apenas 1 instância)

#### Desvantagens:
⚠️ Requer MQTT 5.0 (ou extensões do broker para MQTT 3.1.1)
⚠️ Perde ordenação de mensagens (cada instância recebe subset diferente)
⚠️ Aplicação precisa ser idempotente (mensagens podem chegar duplicadas em caso de falha)

---

### 2️⃣ **Distributed Locking (Redis/Database)**

#### O Que É?
Usa um sistema externo (Redis, PostgreSQL) para coordenar qual instância tem permissão para processar dados.

#### Padrão Singleton com Redis:
```typescript
// Exemplo de implementação
class MqttService {
  private lockKey = 'mqtt:instance:lock';
  private lockTTL = 30000; // 30 segundos

  async connect() {
    // Tentar adquirir lock
    const lockAcquired = await this.redis.set(
      this.lockKey,
      this.instanceId,
      'PX', this.lockTTL,
      'NX' // Set only if not exists
    );

    if (!lockAcquired) {
      console.log('⏸️ Outra instância já está processando MQTT');
      this.startHeartbeat(); // Tentar novamente quando lock expirar
      return;
    }

    console.log('🔒 Lock adquirido - processando MQTT');
    this.connectToMqtt();
    this.renewLockPeriodically();
  }

  private renewLockPeriodically() {
    setInterval(async () => {
      // Renovar lock a cada 10s (TTL é 30s)
      await this.redis.set(this.lockKey, this.instanceId, 'PX', this.lockTTL, 'XX');
    }, 10000);
  }
}
```

#### Algoritmo Redlock (Alta Confiabilidade):
Para ambientes críticos, usa **múltiplos nós Redis**:
1. Cliente tenta adquirir lock em N instâncias Redis (ex: 5)
2. Se maioria concordar (ex: 3/5), lock é concedido
3. Protege contra particionamento de rede e falhas de nós

#### Vantagens:
✅ Garante que apenas 1 instância processa dados (zero conflitos)
✅ Failover automático (se instância cai, lock expira e outra assume)
✅ Funciona com qualquer versão de MQTT
✅ Pode ser implementado com Redis, etcd, PostgreSQL, ZooKeeper

#### Desvantagens:
⚠️ Dependência externa (Redis, etc)
⚠️ Complexidade adicional (timeouts, expiração, renovação)
⚠️ Não escala horizontalmente (apenas 1 instância ativa por vez)
⚠️ Requer configuração cuidadosa de timeouts

---

### 3️⃣ **Message Queue com Consumer Groups**

#### O Que É?
Usa um message broker intermediário (RabbitMQ, Kafka) entre MQTT e a aplicação.

#### Arquitetura:
```
MQTT Broker ──> Message Queue (Kafka/RabbitMQ)
                        │
                        ├─> Consumer Group "aupus-processors"
                        │       ├─> Instância 1 (VPS)
                        │       ├─> Instância 2 (Local Dev)
                        │       └─> Instância 3 (Backup)
                        │
                        └─> Load balancing automático
```

#### Kafka Example:
```typescript
// Uma instância consome de MQTT e publica no Kafka
class MqttToKafkaService {
  async handleMqttMessage(topic: string, payload: Buffer) {
    await this.kafka.send({
      topic: 'mqtt-raw-data',
      messages: [{
        key: equipamentoId,
        value: payload
      }]
    });
  }
}

// Múltiplas instâncias consomem do Kafka
class KafkaConsumerService {
  async init() {
    const consumer = this.kafka.consumer({
      groupId: 'aupus-processors' // Todas instâncias no mesmo grupo
    });

    await consumer.subscribe({ topic: 'mqtt-raw-data' });

    await consumer.run({
      eachMessage: async ({ message }) => {
        await this.processAndSaveToDB(message);
      }
    });
  }
}
```

#### RabbitMQ Consumer Groups:
```typescript
// Spring Cloud Stream define Consumer Groups
// Apenas 1 instância do grupo recebe cada mensagem
@StreamListener(target = Sink.INPUT,
                condition = "headers['type']=='mqtt-data'")
public void handleMqttData(String payload) {
    // Processar e salvar no banco
}
```

#### Vantagens:
✅ Escalabilidade horizontal real
✅ Replay de mensagens (Kafka mantém log por dias/semanas)
✅ Garantias de entrega (at-least-once, exactly-once)
✅ Desacoplamento (MQTT e processamento separados)
✅ Pausa/resume de consumo para desenvolvimento

#### Desvantagens:
⚠️ Infraestrutura adicional (Kafka/RabbitMQ cluster)
⚠️ Latência adicional (mais um hop)
⚠️ Custo operacional (manutenção, monitoramento)
⚠️ Complexidade de configuração

---

### 4️⃣ **Feature Flags / Environment Variables (Solução Atual)**

#### O Que É?
Usar variáveis de ambiente para mudar comportamento em dev/staging/production.

#### Nossa Implementação Atual:
```bash
# Produção
MQTT_MODE=production  # Conecta + Salva

# Desenvolvimento
MQTT_MODE=development # Conecta + NÃO salva

# CI/CD
MQTT_MODE=disabled    # NÃO conecta
```

#### Como a Indústria Usa:
- **LaunchDarkly, Statsig, ConfigCat**: Plataformas dedicadas para feature flags
- **Trunk-Based Development**: Feature flags permitem trabalhar em main branch
- **Progressive Rollout**: Habilitar features gradualmente (5% → 25% → 100%)

#### Vantagens:
✅ Simples de implementar
✅ Zero dependências externas
✅ Flexível para diferentes ambientes
✅ Permite desenvolvimento local sem conflitos

#### Desvantagens:
⚠️ **NÃO escala horizontalmente** (apenas 1 instância em production)
⚠️ Sem tolerância a falhas automática
⚠️ Modo development não salva dados (limitado para testes)
⚠️ Manutenção manual de quem tem qual modo

---

## 🎯 Comparação: Nossa Solução vs Indústria

| Aspecto | Nossa Solução (3 Modos) | Shared Subscriptions | Distributed Lock | Message Queue |
|---------|-------------------------|---------------------|------------------|---------------|
| **Escalabilidade Horizontal** | ❌ Não | ✅ Sim | ❌ Não | ✅ Sim |
| **Tolerância a Falhas** | ❌ Manual | ✅ Automática | ✅ Automática | ✅ Automática |
| **Complexidade** | 🟢 Baixa | 🟡 Média | 🟡 Média | 🔴 Alta |
| **Custo Operacional** | 💰 Baixo | 💰 Baixo | 💰💰 Médio | 💰💰💰 Alto |
| **Dev pode testar localmente** | ✅ Sim (sem salvar) | ✅ Sim (salva) | ⚠️ Complicado | ✅ Sim (salva) |
| **Zero conflitos de dados** | ✅ Sim | ✅ Sim | ✅ Sim | ✅ Sim |
| **Funciona com MQTT 3.1.1** | ✅ Sim | ⚠️ Depende do broker | ✅ Sim | ✅ Sim |
| **Latência** | 🟢 Baixa | 🟢 Baixa | 🟡 Média | 🟡 Média |
| **Garantias de Entrega** | ⚠️ Depende de QoS | ✅ QoS 1/2 | ✅ Configurável | ✅ Forte |

---

## 🚨 Problemas da Nossa Solução Atual

### 1. **Escalabilidade Zero**
- ❌ Apenas 1 instância pode estar em `MQTT_MODE=production`
- ❌ Se servidor cair, MQTT para até restart manual
- ❌ Impossível distribuir carga entre múltiplas instâncias
- ❌ Não aproveita infraestrutura de múltiplos servidores

### 2. **Desenvolvimento Limitado**
- ⚠️ Modo development não salva dados no banco
- ⚠️ Impossível testar fluxo completo localmente
- ⚠️ Precisa simular dados ou modificar código temporariamente
- ⚠️ Teste de integração incompleto

### 3. **Tolerância a Falhas Manual**
- ❌ Se instância production cai, dados são perdidos até restart
- ❌ Sem failover automático
- ❌ Monitoramento manual necessário
- ❌ SLA comprometido

### 4. **Manutenção Manual**
- ⚠️ Equipe precisa lembrar de configurar `MQTT_MODE` corretamente
- ⚠️ Risco de acidentalmente rodar 2 instâncias em production
- ⚠️ Sem mecanismo que previna erro humano
- ⚠️ Documentação deve estar sempre atualizada

---

## ✅ Recomendações para Longo Prazo

### 🥇 **Solução Ideal: Shared Subscriptions (MQTT 5.0)**

**Por quê?**
- ✅ Padrão da indústria (EMQX, HiveMQ, AWS IoT Core)
- ✅ Escalabilidade horizontal nativa
- ✅ Failover automático
- ✅ Zero conflitos (broker distribui mensagens)
- ✅ Desenvolvimento local funciona perfeitamente (cada dev salva subset de dados)

**Como implementar?**

#### Passo 1: Verificar versão do broker MQTT
```bash
# Se estiver usando Mosquitto, atualizar para versão com suporte a shared subscriptions
# Ou migrar para EMQX (open-source) ou HiveMQ Community Edition
```

#### Passo 2: Modificar subscrições em `mqtt.service.ts`
```typescript
// ANTES (subscrição normal)
this.client.subscribe('equipamentos/+/dados');

// DEPOIS (shared subscription)
this.client.subscribe('$share/aupus-processors/equipamentos/+/dados');
//                     ↑                        ↑
//                     Prefixo especial         Nome do grupo
```

#### Passo 3: Configurar estratégia de balanceamento
```typescript
// No broker EMQX - configuração
shared_subscription {
  strategy = least_inflight  // Prioriza instância com menos mensagens
}
```

#### Passo 4: Todas as instâncias podem usar mesmo config
```bash
# Produção VPS 1
MQTT_MODE=production
MQTT_GROUP=aupus-processors

# Produção VPS 2 (backup)
MQTT_MODE=production
MQTT_GROUP=aupus-processors

# Desenvolvimento local
MQTT_MODE=production  # Agora pode usar production!
MQTT_GROUP=aupus-processors  # Broker distribui automaticamente
```

**Resultado:**
- ✅ Todas as instâncias processam dados simultaneamente
- ✅ Broker distribui 50% das mensagens para VPS, 50% para local
- ✅ Se VPS cair, local recebe 100% automaticamente
- ✅ Desenvolvimento local testa fluxo completo real

---

### 🥈 **Solução Intermediária: Distributed Lock (Redis)**

**Por quê?**
- ✅ Funciona com MQTT 3.1.1 (não precisa atualizar broker)
- ✅ Failover automático (se instância cai, lock expira)
- ✅ Zero risco de conflitos
- 💰 Custo médio (precisa de Redis)

**Como implementar?**

#### Passo 1: Adicionar Redis ao projeto
```bash
npm install ioredis
```

#### Passo 2: Modificar `mqtt.service.ts`
```typescript
import Redis from 'ioredis';

@Injectable()
export class MqttService {
  private redis: Redis;
  private lockKey = 'mqtt:processing:lock';
  private lockTTL = 30000; // 30 segundos
  private instanceId = process.env.INSTANCE_ID || 'unknown';

  async onModuleInit() {
    this.redis = new Redis(process.env.REDIS_URL);
    await this.tryAcquireLockAndConnect();
  }

  private async tryAcquireLockAndConnect() {
    const acquired = await this.redis.set(
      this.lockKey,
      this.instanceId,
      'PX', this.lockTTL,
      'NX' // Set only if not exists
    );

    if (acquired === 'OK') {
      console.log(`🔒 [MQTT] Lock adquirido por: ${this.instanceId}`);
      await this.connect();
      this.startLockRenewal();
    } else {
      const currentOwner = await this.redis.get(this.lockKey);
      console.log(`⏸️ [MQTT] Lock pertence a: ${currentOwner}`);
      this.waitForLockRelease();
    }
  }

  private startLockRenewal() {
    // Renovar lock a cada 10s (TTL é 30s)
    setInterval(async () => {
      const renewed = await this.redis.set(
        this.lockKey,
        this.instanceId,
        'PX', this.lockTTL,
        'XX' // Set only if already exists
      );

      if (renewed !== 'OK') {
        console.error('❌ [MQTT] Falha ao renovar lock! Desconectando...');
        this.disconnect();
        this.tryAcquireLockAndConnect();
      }
    }, 10000);
  }

  private waitForLockRelease() {
    // Usar Redis PubSub ou polling para detectar quando lock expirar
    setInterval(() => {
      this.tryAcquireLockAndConnect();
    }, 5000);
  }

  async onModuleDestroy() {
    // Liberar lock ao desligar gracefully
    const currentOwner = await this.redis.get(this.lockKey);
    if (currentOwner === this.instanceId) {
      await this.redis.del(this.lockKey);
      console.log(`🔓 [MQTT] Lock liberado por: ${this.instanceId}`);
    }
  }
}
```

#### Passo 3: Configurar Redis
```bash
# .env
REDIS_URL=redis://localhost:6379

# Produção VPS
INSTANCE_ID=production-vps-1

# Produção VPS 2 (standby)
INSTANCE_ID=production-vps-2

# Desenvolvimento
INSTANCE_ID=local-dev-pedro
```

**Resultado:**
- ✅ Instância VPS 1 adquire lock e processa MQTT
- ✅ VPS 2 fica em standby (tenta adquirir lock a cada 5s)
- ✅ Se VPS 1 cair, lock expira em 30s e VPS 2 assume automaticamente
- ✅ Dev local também pode assumir se ambos servidores caírem

---

### 🥉 **Solução Completa: Message Queue (Kafka/RabbitMQ)**

**Por quê?**
- ✅ Escalabilidade máxima (milhões de mensagens/segundo)
- ✅ Replay de dados (re-processar últimos 7 dias se necessário)
- ✅ Desacoplamento total (MQTT e processamento separados)
- 💰💰💰 Custo alto (infraestrutura Kafka/RabbitMQ)

**Como implementar?**

#### Arquitetura:
```
┌──────────────┐
│ MQTT Broker  │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Gateway     │ ──> 1 instância apenas (consome MQTT e publica no Kafka)
│  (MQTT→Kafka)│
└──────┬───────┘
       │
       ▼
┌──────────────┐
│    Kafka     │
│  Topic:      │
│  mqtt-data   │
└──────┬───────┘
       │
       ├──────> Processador 1 (VPS 1)     ──> Salva no banco
       ├──────> Processador 2 (VPS 2)     ──> Salva no banco
       ├──────> Processador 3 (Dev local) ──> Salva no banco
       └──────> Processador 4 (Analytics) ──> Treina ML
```

#### Código:
```typescript
// gateway.service.ts - MQTT → Kafka
@Injectable()
export class MqttToKafkaGateway {
  constructor(
    private kafka: KafkaService,
    private mqtt: MqttService
  ) {}

  async onModuleInit() {
    this.mqtt.client.on('message', async (topic, payload) => {
      await this.kafka.send({
        topic: 'mqtt-raw-data',
        messages: [{
          key: this.extractEquipamentoId(topic),
          value: payload,
          headers: { topic }
        }]
      });
    });
  }
}

// processor.service.ts - Kafka → Database
@Injectable()
export class DataProcessor {
  async onModuleInit() {
    const consumer = this.kafka.consumer({
      groupId: 'aupus-data-processors'
    });

    await consumer.subscribe({ topic: 'mqtt-raw-data' });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const data = JSON.parse(message.value.toString());
        await this.processAndSave(data);
      }
    });
  }
}
```

**Resultado:**
- ✅ Gateway ingere MQTT 24/7
- ✅ 3+ instâncias processam dados em paralelo (cada uma recebe subset)
- ✅ Kafka garante que cada mensagem é processada exatamente 1 vez
- ✅ Se processador cai, Kafka redireciona para outros
- ✅ Pode reprocessar últimos 7 dias se houver bug

---

## 📈 Roadmap Recomendado

### ✅ Curto Prazo (1-2 semanas)
**Manter solução atual (3 modos) COM melhorias:**

1. **Adicionar health check robusto:**
   ```typescript
   // Alertar se NENHUMA instância está em modo production
   @Cron('*/5 * * * *') // A cada 5 minutos
   async checkMqttHealth() {
     const ultimoDado = await this.prisma.equipamentos_dados.findFirst({
       orderBy: { created_at: 'desc' }
     });

     const minutosSemDados = (Date.now() - ultimoDado.created_at) / 60000;

     if (minutosSemDados > 10) {
       // Enviar alerta para Slack/Email
       await this.alertService.send({
         level: 'CRITICAL',
         message: `MQTT sem dados há ${minutosSemDados} minutos!`
       });
     }
   }
   ```

2. **Adicionar métricas de monitoramento:**
   ```typescript
   // Prometheus metrics
   this.metricsService.increment('mqtt.messages.received', {
     instance: this.instanceId,
     mode: this.mqttMode
   });
   ```

3. **Documentar processo de failover manual:**
   ```markdown
   # PROCEDIMENTO DE EMERGÊNCIA - MQTT OFFLINE

   1. Verificar se servidor principal está online:
      ssh user@vps-ip "pm2 status"

   2. Se offline, ativar backup:
      - Editar .env local: MQTT_MODE=production
      - Reiniciar: npm run start:dev

   3. Monitorar logs para confirmar ingestão

   4. Quando servidor principal voltar, desativar local:
      - MQTT_MODE=development
   ```

### 🎯 Médio Prazo (1-2 meses)
**Implementar Distributed Lock (Redis):**

- [ ] Adicionar Redis ao projeto
- [ ] Implementar lock com TTL e renovação
- [ ] Testar failover automático
- [ ] Atualizar documentação
- [ ] **Benefício:** Failover automático em ~30 segundos

### 🚀 Longo Prazo (3-6 meses)
**Migrar para Shared Subscriptions:**

- [ ] Avaliar broker MQTT atual (Mosquitto? EMQX?)
- [ ] Se necessário, migrar para EMQX open-source
- [ ] Modificar código para usar `$share/group/topic`
- [ ] Testar com 2-3 instâncias simultâneas
- [ ] **Benefício:** Escalabilidade horizontal real + Alta disponibilidade

### 🏆 Futuro (6-12 meses)
**Se crescimento justificar, considerar Message Queue:**

- [ ] Avaliar volume de mensagens (msgs/segundo)
- [ ] Se > 10k msgs/segundo, considerar Kafka
- [ ] Arquitetura: Gateway (MQTT→Kafka) + Processadores (Kafka→DB)
- [ ] **Benefício:** Escalabilidade infinita + Replay de dados

---

## 🎓 Lições da Indústria

### 1. **Simplicidade vs Escalabilidade**
> "Premature optimization is the root of all evil" - Donald Knuth

- ✅ Começar simples é OK (nossa solução atual)
- ⚠️ Mas ter plano de migração é essencial
- ✅ Evolução gradual: Flags → Lock → Shared Subs → Queue

### 2. **Idempotência é Fundamental**
Independente da solução, sua aplicação DEVE ser idempotente:

```typescript
// ❌ NÃO idempotente
async salvarDados(dados) {
  await this.prisma.equipamentos_dados.create({ dados });
}

// ✅ Idempotente (usando upsert)
async salvarDados(dados) {
  await this.prisma.equipamentos_dados.upsert({
    where: { uk_equipamento_timestamp: { ... } },
    update: { dados },
    create: { dados }
  });
}
```

**Por quê?**
- Shared Subscriptions podem entregar mensagem 2x em caso de falha
- Message Queues garantem "at-least-once" (pelo menos 1 vez)
- Network retry pode duplicar mensagens

### 3. **Monitoramento é Crítico**
Empresas de ponta monitoram:
- ✅ Taxa de mensagens/segundo
- ✅ Latência de ponta-a-ponta
- ✅ Taxa de erro/retry
- ✅ Número de instâncias ativas
- ✅ Health do broker MQTT

### 4. **Testes de Caos (Chaos Engineering)**
Netflix, AWS, Google testam regularmente:
- 💥 Desligar instâncias aleatoriamente
- 💥 Simular latência de rede
- 💥 Desconectar do broker MQTT
- 💥 Encher fila de mensagens

**Ferramentas:**
- Chaos Monkey (Netflix)
- Gremlin
- LitmusChaos

---

## 🔧 Código de Exemplo Completo: Shared Subscriptions

```typescript
// mqtt.service.ts - Versão com Shared Subscriptions
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as mqtt from 'mqtt';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private client: mqtt.MqttClient;
  private instanceId = process.env.INSTANCE_ID || 'unknown';
  private groupName = process.env.MQTT_GROUP || 'aupus-processors';

  async onModuleInit() {
    await this.connect();
  }

  private async connect() {
    const mqttUrl = `mqtt://${process.env.MQTT_HOST}:${process.env.MQTT_PORT}`;

    this.client = mqtt.connect(mqttUrl, {
      clientId: `aupus-${this.instanceId}-${Math.random().toString(16).substr(2, 8)}`,
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      clean: true,
      reconnectPeriod: 5000,
    });

    this.client.on('connect', () => {
      console.log(`✅ [MQTT] Instância ${this.instanceId} conectada`);
      this.subscribeToSharedTopics();
    });

    this.client.on('message', (topic, payload) => {
      console.log(`📨 [${this.instanceId}] Mensagem recebida:`, topic);
      this.handleMessage(topic, payload);
    });

    this.client.on('error', (error) => {
      console.error(`❌ [MQTT] Erro em ${this.instanceId}:`, error);
    });
  }

  private subscribeToSharedTopics() {
    // ✅ Shared Subscription - MQTT 5.0
    // Formato: $share/{GroupName}/{Topic}
    const topics = [
      `$share/${this.groupName}/equipamentos/+/dados`,
      `$share/${this.groupName}/equipamentos/+/status`,
    ];

    topics.forEach(topic => {
      this.client.subscribe(topic, { qos: 1 }, (err) => {
        if (err) {
          console.error(`❌ [MQTT] Erro ao subscrever ${topic}:`, err);
        } else {
          console.log(`📡 [MQTT] ${this.instanceId} inscrito em: ${topic}`);
        }
      });
    });
  }

  private async handleMessage(topic: string, payload: Buffer) {
    try {
      const data = JSON.parse(payload.toString());

      // Log para debug (qual instância processou qual mensagem)
      console.log(`⚙️ [${this.instanceId}] Processando:`, {
        topic,
        equipamento: data.equipamento_id,
        timestamp: new Date().toISOString()
      });

      // ✅ IMPORTANTE: Usar upsert para idempotência
      await this.processAndSave(topic, data);

    } catch (error) {
      console.error(`❌ [${this.instanceId}] Erro ao processar mensagem:`, error);
      // Não dar ACK (QoS 1) - broker vai reenviar para outra instância
    }
  }

  private async processAndSave(topic: string, data: any) {
    const equipamentoId = this.extractEquipamentoId(topic);
    const timestamp = new Date(data.timestamp || Date.now());

    // Processar dados...
    const dadosProcessados = this.processDados(data);

    // ✅ Upsert garante idempotência
    await this.prisma.equipamentos_dados.upsert({
      where: {
        uk_equipamento_timestamp: {
          equipamento_id: equipamentoId,
          timestamp_dados: timestamp,
        },
      },
      update: {
        dados: dadosProcessados,
        updated_at: new Date(),
        processed_by: this.instanceId // Útil para debug
      },
      create: {
        equipamento_id: equipamentoId,
        timestamp_dados: timestamp,
        dados: dadosProcessados,
        fonte: 'MQTT',
        processed_by: this.instanceId
      },
    });

    console.log(`✅ [${this.instanceId}] Dados salvos:`, equipamentoId);
  }

  async onModuleDestroy() {
    this.client?.end();
    console.log(`👋 [MQTT] Instância ${this.instanceId} desconectada`);
  }
}
```

**Configuração (.env):**
```bash
# Todas as instâncias usam mesmas configurações!
MQTT_HOST=broker.hivemq.com
MQTT_PORT=1883
MQTT_GROUP=aupus-processors

# Apenas o INSTANCE_ID difere
# VPS 1:
INSTANCE_ID=production-vps-1

# VPS 2:
INSTANCE_ID=production-vps-2

# Dev local:
INSTANCE_ID=local-dev-pedro
```

**Resultado:**
```
# Broker MQTT recebe 100 mensagens
# Distribui automaticamente:
├─> VPS 1 processa 50 mensagens
├─> VPS 2 processa 30 mensagens
└─> Dev local processa 20 mensagens

# Se VPS 1 cair:
├─> VPS 2 processa 60 mensagens
└─> Dev local processa 40 mensagens

# Zero conflitos (broker garante)
# Zero configuração manual
# Failover automático
```

---

## 📚 Referências

1. **MQTT Shared Subscriptions:**
   - HiveMQ: https://www.hivemq.com/blog/mqtt5-essentials-part7-shared-subscriptions/
   - EMQX: https://www.emqx.com/en/blog/introduction-to-mqtt5-protocol-shared-subscription
   - MarsBased Case Study: https://marsbased.com/blog/2024/03/28/horizontally-scale-iot-backends-with-mqtt-shared-subscriptions

2. **Distributed Locking:**
   - Redis Official: https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/
   - Martin Kleppmann: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html

3. **Message Queue Patterns:**
   - AWS IoT Patterns: https://aws.amazon.com/blogs/iot/7-patterns-for-iot-data-ingestion-and-visualization/
   - Kafka for IoT: https://www.redpanda.com/blog/streaming-data-platform-for-iot-edge

4. **Feature Flags:**
   - Martin Fowler: https://martinfowler.com/articles/feature-toggles.html
   - LaunchDarkly: https://launchdarkly.com/blog/what-are-feature-flags/

5. **NestJS Scaling:**
   - NestJS MQTT: https://docs.nestjs.com/microservices/mqtt
   - Scaling Guide: https://medium.com/@nishadburhan/scaling-a-nestjs-application-with-clusters-and-load-balancing-7876673569a

---

## 💡 Conclusão

### Sua Preocupação É Válida ✅

A solução de 3 modos (production/development/disabled) **é adequada para:**
- ✅ MVP e protótipos
- ✅ Startups em fase inicial
- ✅ Projetos com 1 servidor
- ✅ Volume baixo de mensagens (<100/segundo)

**MAS não é escalável para:**
- ❌ Alta disponibilidade (99.9% uptime)
- ❌ Múltiplos servidores
- ❌ Crescimento de volume
- ❌ Tolerância a falhas automática

### Próximos Passos Recomendados

1. **Imediato (esta semana):**
   - ✅ Manter solução atual
   - ✅ Adicionar monitoramento robusto
   - ✅ Documentar procedimento de emergência

2. **Curto prazo (1-2 meses):**
   - 🎯 Implementar Distributed Lock com Redis
   - 🎯 Testar failover automático

3. **Médio prazo (3-6 meses):**
   - 🚀 Migrar para Shared Subscriptions
   - 🚀 Escalar horizontalmente

A indústria prefere **Shared Subscriptions** como solução de longo prazo. É o padrão ouro para MQTT em produção.

---

**Preparado por:** Claude (Anthropic)
**Data:** 29/12/2024
**Baseado em:** Pesquisa de fontes 2024-2025 + Best practices da indústria
