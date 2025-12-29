# 🎯 Recomendação: Evolução da Arquitetura MQTT

**Data:** 29/12/2024
**Contexto:** "não sei se no longo prazo isso vai funcionar"

---

## 📊 Diagnóstico: Situação Atual

### ✅ O Que Funciona Bem
- Solução simples e fácil de entender
- Zero dependências externas (sem Redis, Kafka, etc)
- Permite desenvolvimento local sem conflitos
- Previne múltiplas instâncias salvando dados duplicados

### ❌ Limitações Críticas
- **Escalabilidade:** Apenas 1 instância ativa por vez
- **Disponibilidade:** Sem failover automático (downtime manual)
- **Desenvolvimento:** Modo dev não salva dados (testes limitados)
- **Operacional:** Manutenção manual, risco de erro humano

---

## 🎓 O Que a Indústria Faz?

Pesquisei dezenas de fontes (EMQX, HiveMQ, AWS IoT, projetos NestJS, etc) e identifiquei **3 padrões principais:**

### 1️⃣ **MQTT Shared Subscriptions** (Mais Usado)
- ✅ Múltiplas instâncias compartilham mesma subscrição
- ✅ Broker distribui mensagens automaticamente (load balancing)
- ✅ Failover automático
- ✅ Padrão da indústria (EMQX, HiveMQ, AWS IoT)

**Exemplo real:** Plataforma IoT da Ecler (2024) usa shared subscriptions para escalar horizontalmente amplificadores conectados.

### 2️⃣ **Distributed Lock** (Redis/Database)
- ✅ Apenas 1 instância processa, outras em standby
- ✅ Failover automático quando lock expira
- ✅ Funciona com qualquer broker MQTT

**Exemplo real:** Padrão Singleton usado em projetos NestJS para garantir apenas 1 worker MQTT ativo.

### 3️⃣ **Message Queue** (Kafka/RabbitMQ)
- ✅ Escalabilidade máxima
- ✅ Replay de dados
- ✅ Desacoplamento total
- ❌ Infraestrutura complexa e cara

**Exemplo real:** Arquiteturas IoT enterprise da AWS, Google Cloud IoT.

---

## 🎯 Minha Recomendação

### 📅 **Roadmap Gradual (Evolutivo, Não Revolucionário)**

```
┌─────────────────────────────────────────────────────────────────┐
│  HOJE          1-2 MESES        3-6 MESES       FUTURO          │
│                                                                  │
│  3 Modos  ──>  Redis Lock  ──>  Shared Subs  ──> Message Queue │
│  (Atual)       (Failover)       (Escala)         (Se necessário)│
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Fase 1: HOJE - Melhorar Solução Atual
**Tempo:** 1-2 dias
**Custo:** Zero

### Ações:
1. ✅ **Manter 3 modos** (production/development/disabled)
2. ✅ **Adicionar monitoramento crítico:**

```typescript
// health.service.ts
@Cron('*/5 * * * *') // A cada 5 minutos
async alertIfNoMqttData() {
  const ultimoDado = await this.prisma.equipamentos_dados.findFirst({
    orderBy: { created_at: 'desc' }
  });

  const minutosSemDados = (Date.now() - ultimoDado.created_at) / 60000;

  if (minutosSemDados > 10) {
    // 🚨 ALERTA CRÍTICO
    await this.slack.send({
      channel: '#alertas-producao',
      message: `🔴 MQTT SEM DADOS HÁ ${Math.floor(minutosSemDados)} MINUTOS!`
    });
  }
}
```

3. ✅ **Documentar procedimento de failover manual:**

```markdown
# PROCEDIMENTO DE EMERGÊNCIA

## Sintoma: Servidor principal offline

1. SSH no servidor: `ssh user@vps-ip`
2. Verificar PM2: `pm2 status`
3. Se offline, ativar backup local:
   - Editar .env: `MQTT_MODE=production`
   - Reiniciar: `npm run start:dev`
4. Monitorar: Verificar dados chegando no banco
5. Quando servidor voltar, desativar local: `MQTT_MODE=development`
```

### Resultado:
- ✅ Sistema atual funcionando
- ✅ Alertas automáticos se MQTT parar
- ✅ Procedimento claro para emergências
- ✅ **Tempo de resposta a falhas: ~5 minutos** (manual)

---

## 🎯 Fase 2: 1-2 MESES - Distributed Lock (Redis)
**Tempo:** 1 semana de desenvolvimento
**Custo:** ~$5-10/mês (Redis Cloud) ou $0 (Redis local/VPS)

### Por que fazer isso?
- ✅ **Failover automático** em ~30 segundos (vs 5 minutos manual)
- ✅ Funciona com MQTT 3.1.1 (não precisa atualizar broker)
- ✅ Baixa complexidade
- ✅ Alta disponibilidade sem múltiplas instâncias salvando dados

### Como implementar:

```typescript
// mqtt.service.ts
import Redis from 'ioredis';

@Injectable()
export class MqttService {
  private redis: Redis;
  private lockKey = 'mqtt:instance:lock';
  private lockTTL = 30000; // 30 segundos

  async onModuleInit() {
    this.redis = new Redis(process.env.REDIS_URL);
    await this.tryAcquireLockAndConnect();
  }

  private async tryAcquireLockAndConnect() {
    // Tentar adquirir lock
    const acquired = await this.redis.set(
      this.lockKey,
      this.instanceId,
      'PX', this.lockTTL,
      'NX'
    );

    if (acquired === 'OK') {
      console.log(`🔒 Lock adquirido: ${this.instanceId}`);
      await this.connect();
      this.renewLockPeriodically();
    } else {
      console.log(`⏸️ Standby: Outra instância ativa`);
      this.waitForLockRelease();
    }
  }

  private renewLockPeriodically() {
    setInterval(async () => {
      await this.redis.set(
        this.lockKey,
        this.instanceId,
        'PX', this.lockTTL,
        'XX'
      );
    }, 10000); // Renovar a cada 10s
  }

  private waitForLockRelease() {
    // Tentar adquirir lock a cada 5s
    setInterval(() => {
      this.tryAcquireLockAndConnect();
    }, 5000);
  }
}
```

### Resultado:
- ✅ VPS 1 processa MQTT
- ✅ VPS 2 em standby (verifica lock a cada 5s)
- ✅ Se VPS 1 cair → lock expira em 30s → VPS 2 assume
- ✅ **Failover automático em ~30 segundos**
- ✅ Zero conflitos de dados

---

## 🚀 Fase 3: 3-6 MESES - Shared Subscriptions
**Tempo:** 2-3 semanas (incluindo testes)
**Custo:** Zero (EMQX open-source) ou ~$50-100/mês (HiveMQ Cloud)

### Por que fazer isso?
- ✅ **Escalabilidade horizontal real** (múltiplas instâncias processando simultaneamente)
- ✅ Failover instantâneo (broker redistribui automaticamente)
- ✅ Padrão da indústria
- ✅ Desenvolvimento local funciona 100% (salva dados reais)

### Pré-requisitos:
1. Broker MQTT com suporte a Shared Subscriptions:
   - ✅ EMQX (open-source, grátis)
   - ✅ HiveMQ Community Edition (grátis)
   - ✅ Mosquitto 2.0+ (grátis)
   - ⚠️ Verificar se seu broker atual suporta

### Como implementar:

```typescript
// mqtt.service.ts
private subscribeToSharedTopics() {
  // Formato: $share/{GroupName}/{Topic}
  const topics = [
    '$share/aupus-processors/equipamentos/+/dados',
    '$share/aupus-processors/equipamentos/+/status'
  ];

  topics.forEach(topic => {
    this.client.subscribe(topic, { qos: 1 });
  });
}
```

### Configuração:
```bash
# TODAS as instâncias usam mesma configuração!
MQTT_HOST=broker.emqx.io
MQTT_PORT=1883
MQTT_GROUP=aupus-processors

# Apenas INSTANCE_ID difere:
# VPS 1: INSTANCE_ID=prod-1
# VPS 2: INSTANCE_ID=prod-2
# Local: INSTANCE_ID=dev-pedro
```

### Resultado:
- ✅ VPS 1 processa 40% das mensagens
- ✅ VPS 2 processa 40% das mensagens
- ✅ Dev local processa 20% das mensagens
- ✅ **Se qualquer instância cair → broker redistribui instantaneamente**
- ✅ Zero configuração manual
- ✅ Desenvolvimento local salva dados reais (subset)

---

## 🏆 Fase 4: FUTURO - Message Queue (Se Necessário)
**Quando considerar:** Se volume > 10k msgs/segundo OU precisa de replay de dados

**Arquitetura:**
```
MQTT Broker ──> Gateway ──> Kafka ──> Múltiplos Processadores
```

**Benefícios:**
- ✅ Escalabilidade infinita
- ✅ Replay de dados (reprocessar últimos 7 dias)
- ✅ Múltiplos consumers para diferentes fins (DB, Analytics, ML)

**Custo:**
- 💰💰💰 Alto (infraestrutura Kafka/RabbitMQ)
- ⏱️ Complexo (configuração, monitoramento, manutenção)

**Recomendação:** Só fazer se volume justificar.

---

## 📊 Comparação das Fases

| Aspecto | Fase 1 (Atual) | Fase 2 (Redis) | Fase 3 (Shared) | Fase 4 (Kafka) |
|---------|----------------|----------------|-----------------|----------------|
| **Escalabilidade** | ❌ 1 instância | ❌ 1 instância | ✅ N instâncias | ✅ N instâncias |
| **Failover** | 🟡 Manual (5min) | ✅ Auto (30s) | ✅ Instantâneo | ✅ Instantâneo |
| **Complexidade** | 🟢 Baixa | 🟡 Média | 🟡 Média | 🔴 Alta |
| **Custo** | 💰 $0 | 💰 $5-10/mês | 💰 $0-50/mês | 💰💰💰 $200+/mês |
| **Dev local** | ⚠️ Não salva | ⚠️ Standby | ✅ Salva subset | ✅ Salva subset |
| **Tempo para implementar** | ✅ Hoje | 🟡 1 semana | 🟡 2-3 semanas | 🔴 1-2 meses |

---

## 💡 Recomendação Final

### 🎯 **Execute as 3 primeiras fases nesta ordem:**

```
┌──────────────────────────────────────────────────────────────┐
│ 1. HOJE (1-2 dias)                                           │
│    ✅ Melhorar solução atual                                 │
│    ✅ Adicionar monitoramento                                │
│    ✅ Documentar procedimentos                               │
├──────────────────────────────────────────────────────────────┤
│ 2. EM 1-2 MESES (1 semana dev)                               │
│    🎯 Implementar Redis Lock                                 │
│    ✅ Failover automático em 30s                             │
│    ✅ Alta disponibilidade                                   │
├──────────────────────────────────────────────────────────────┤
│ 3. EM 3-6 MESES (2-3 semanas dev)                            │
│    🚀 Migrar para Shared Subscriptions                       │
│    ✅ Escalabilidade horizontal                              │
│    ✅ Desenvolvimento local 100% funcional                   │
├──────────────────────────────────────────────────────────────┤
│ 4. FUTURO (Somente se necessário)                            │
│    ⏰ Message Queue (Kafka/RabbitMQ)                         │
│    ⚠️ Só se volume > 10k msgs/s                              │
└──────────────────────────────────────────────────────────────┘
```

### 🏅 **Meta de 6 meses:**
Ter Shared Subscriptions funcionando = Padrão da indústria implementado.

### ⚖️ **Por que essa ordem?**

1. **Fase 1 (Hoje):** Melhora imediata sem risco
2. **Fase 2 (Redis):** Ganha failover automático com baixo esforço
3. **Fase 3 (Shared):** Escalabilidade real + Melhor experiência de desenvolvimento
4. **Fase 4 (Kafka):** Só se realmente precisar (provavelmente não)

---

## 📝 Checklist de Implementação

### ✅ Fase 1 (Esta Semana)
- [ ] Implementar cron job de health check
- [ ] Configurar alertas (Slack/Email)
- [ ] Criar documento de procedimentos de emergência
- [ ] Testar procedimento de failover manual
- [ ] Adicionar métricas no dashboard (tempo desde último dado MQTT)

### 🎯 Fase 2 (Próximo Sprint)
- [ ] Adicionar Redis ao projeto (`npm install ioredis`)
- [ ] Implementar lock acquisition logic
- [ ] Implementar lock renewal (heartbeat)
- [ ] Implementar standby mode (wait for lock)
- [ ] Testar cenário: VPS 1 cai, VPS 2 assume
- [ ] Documentar configuração Redis
- [ ] Deploy em staging
- [ ] Deploy em production

### 🚀 Fase 3 (Q1 2025)
- [ ] Avaliar broker MQTT atual
- [ ] Se necessário, migrar para EMQX/HiveMQ
- [ ] Modificar código para usar `$share/group/topic`
- [ ] Configurar estratégia de balanceamento (least_inflight recomendado)
- [ ] Testar com 2-3 instâncias simultâneas
- [ ] Validar idempotência (upsert já implementado ✅)
- [ ] Monitorar distribuição de carga
- [ ] Ajustar número de instâncias baseado em métricas

---

## 🎓 Lições da Indústria

1. **Começar simples é correto** ✅
   - Sua solução atual foi certa para MVP
   - Evolução gradual é melhor que big bang

2. **Shared Subscriptions é o padrão ouro** 🏆
   - EMQX, HiveMQ, AWS IoT, todos usam
   - Suporta 100M+ conexões simultâneas (EMQX comprovado)

3. **Idempotência é fundamental** 🔑
   - Você já implementou (upsert) ✅
   - Essencial para qualquer solução escalável

4. **Message Queue é overkill para maioria** ⚠️
   - Só considerar se volume > 10k msgs/s
   - Shared Subscriptions resolve 95% dos casos

---

## 📞 Próximo Passo

**Sugestão:** Vamos começar pela **Fase 1 hoje mesmo**?

Posso te ajudar a:
1. ✅ Implementar o health check com alertas
2. ✅ Criar dashboard de monitoramento
3. ✅ Escrever procedimento de emergência detalhado

Depois, em 1-2 meses, implementamos o Redis Lock para failover automático.

Em 3-6 meses, migramos para Shared Subscriptions e você terá uma arquitetura **equivalente às melhores práticas da indústria**.

---

**Resumo:** Sua preocupação é válida. A solução atual funciona mas não escala. Recomendo evolução gradual (não revolução) seguindo roadmap de 3 fases acima. Isso te leva do MVP atual para padrão da indústria em 6 meses.

---

**Preparado por:** Claude (Anthropic)
**Data:** 29/12/2024
**Baseado em:** Pesquisa de mercado + Best practices 2024-2025
