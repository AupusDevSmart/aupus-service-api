# 🎮 Guia de Modos de Operação MQTT

## 📌 Problema Resolvido

Você tem razão! A solução anterior com `MQTT_ENABLED=false` impedia o desenvolvimento local de funcionalidades que usam MQTT.

Vamos implementar **3 modos flexíveis** em vez de apenas on/off.

---

## 🚦 Modos Disponíveis

### 1️⃣ **PRODUÇÃO** (`production`)
**Quando usar:** Servidor principal em produção

```bash
# .env em PRODUÇÃO
MQTT_MODE=production
INSTANCE_ID=production-server
```

**Comportamento:**
- ✅ Conecta ao broker MQTT
- ✅ Recebe mensagens dos equipamentos
- ✅ **SALVA dados no banco de dados**
- ✅ Emite eventos WebSocket
- ✅ Logs completos

**Logs esperados:**
```
🚀 [MQTT] MODO PRODUÇÃO - Instância: production-server
🔌 [MQTT] Conectando ao broker: mqtt://broker:1883
✅ [MQTT] Conectado com sucesso!
📡 [MQTT] Carregando 50 tópicos MQTT...
✅ [Buffer] Flush inversor-1: 60 leituras agregadas (bom)
```

---

### 2️⃣ **DESENVOLVIMENTO** (`development`)
**Quando usar:** Desenvolvimento local testando funcionalidades MQTT

```bash
# .env em DESENVOLVIMENTO
MQTT_MODE=development
INSTANCE_ID=local-dev-pedro
```

**Comportamento:**
- ✅ Conecta ao broker MQTT
- ✅ Recebe mensagens dos equipamentos
- ⚠️ **NÃO SALVA dados no banco** (apenas loga)
- ✅ Emite eventos WebSocket (para testar UI)
- ✅ Logs detalhados para debug

**Logs esperados:**
```
🔧 [MQTT] MODO DESENVOLVIMENTO - Instância: local-dev-pedro
🔧 [MQTT] Conectará ao MQTT mas NÃO salvará dados no banco
✅ [MQTT] Conectado com sucesso!
📡 [MQTT] Carregando 50 tópicos MQTT...
📨 [DEV] Mensagem recebida (não salva): inversor-1 | 2500W
```

---

### 3️⃣ **DESABILITADO** (`disabled`)
**Quando usar:** Backend que não precisa de MQTT (ex: testes unitários, CI/CD)

```bash
# .env em TESTES
MQTT_MODE=disabled
INSTANCE_ID=ci-tests
```

**Comportamento:**
- ❌ NÃO conecta ao broker MQTT
- ❌ NÃO recebe mensagens
- ❌ NÃO salva dados
- ❌ NÃO emite eventos
- ℹ️ Logs informativos

**Logs esperados:**
```
⏸️ [MQTT] DESABILITADO para instância: ci-tests
⏸️ [MQTT] Dados MQTT NÃO serão processados nesta instância
⏸️ [MQTT] Configure MQTT_MODE=development ou production para habilitar
```

---

## 🎯 Casos de Uso

### Cenário 1: **Desenvolver nova dashboard MQTT**

**Problema:** Preciso ver dados MQTT em tempo real, mas não quero salvar no banco.

**Solução:**
```bash
# .env local
MQTT_MODE=development
INSTANCE_ID=dev-dashboard-feature
```

**Resultado:**
- ✅ Recebe dados MQTT via WebSocket
- ✅ Dashboard atualiza em tempo real
- ✅ Backend de produção continua salvando dados normalmente
- ✅ Sem conflito de dados duplicados

---

### Cenário 2: **Testar novo parser de dados**

**Problema:** Preciso ver os JSONs MQTT brutos para criar/testar um parser.

**Solução:**
```bash
# .env local
MQTT_MODE=development
INSTANCE_ID=dev-parser-test
```

**Adicione logs temporários:**
```typescript
// No handleMessage() ou processarDadosEquipamento()
if (process.env.MQTT_MODE === 'development') {
  console.log('🔍 [DEV] JSON MQTT recebido:', JSON.stringify(dados, null, 2));
}
```

**Resultado:**
- ✅ Vê JSONs completos nos logs
- ✅ Testa parser sem afetar produção
- ✅ Pode debugar tranquilamente

---

### Cenário 3: **Rodar testes automatizados**

**Problema:** CI/CD não precisa de MQTT, mas está crashando por falta de broker.

**Solução:**
```bash
# .env.test
MQTT_MODE=disabled
INSTANCE_ID=ci-pipeline
```

**Resultado:**
- ✅ Backend inicia normalmente
- ✅ Testes rodam sem erro de conexão MQTT
- ✅ CI/CD passa verde

---

## ✅ IMPLEMENTAÇÃO COMPLETA

O sistema de 3 modos foi implementado com sucesso! Veja abaixo como foi feito:

---

## 🔧 Implementação Realizada

### 1. ✅ Modificado `mqtt.service.ts`

```typescript
private async connect() {
  // Ler modo do .env
  const mqttMode = process.env.MQTT_MODE || 'production';
  const instanceId = process.env.INSTANCE_ID || 'unknown';

  // Se desabilitado, não conectar
  if (mqttMode === 'disabled') {
    console.warn(`⏸️ [MQTT] DESABILITADO para instância: ${instanceId}`);
    return;
  }

  // Logs baseados no modo
  if (mqttMode === 'development') {
    console.log(`🔧 [MQTT] MODO DESENVOLVIMENTO - Instância: ${instanceId}`);
    console.log(`🔧 [MQTT] Conectará ao MQTT mas NÃO salvará dados no banco`);
  } else {
    console.log(`🚀 [MQTT] MODO PRODUÇÃO - Instância: ${instanceId}`);
  }

  // ... resto da conexão normal
}
```

### 2. Modificar `flushBuffer()` para respeitar modo

```typescript
private async flushBuffer(equipamentoId: string, buffer: BufferData) {
  const mqttMode = process.env.MQTT_MODE || 'production';

  // Em modo desenvolvimento, apenas logar sem salvar
  if (mqttMode === 'development') {
    console.log(`📨 [DEV] Buffer flush simulado (não salva):`, {
      equipamento: equipamentoId,
      leituras: buffer.leituras.length,
      dados: buffer.leituras[buffer.leituras.length - 1] // última leitura
    });

    // Limpar buffer mesmo sem salvar
    buffer.leituras = [];
    buffer.timestamp_inicio = new Date();
    return;
  }

  // PRODUÇÃO: Salvar normalmente no banco
  // ... código atual com upsert
}
```

### 3. Modificar `salvarDadosM160Resumo()` da mesma forma

```typescript
private async salvarDadosM160Resumo(...) {
  const mqttMode = process.env.MQTT_MODE || 'production';

  if (mqttMode === 'development') {
    console.log(`📨 [DEV] M160 Resumo recebido (não salva):`, {
      equipamento: equipamentoId,
      energia: resumo.energia_total,
      potencia: resumo.Pa_medio
    });
    return;
  }

  // PRODUÇÃO: Salvar normalmente
  // ... código atual com upsert
}
```

---

## 📋 Checklist de Configuração

### Para Produção (VPS/PM2)
- [ ] `.env` tem `MQTT_MODE=production`
- [ ] `.env` tem `INSTANCE_ID=production-server`
- [ ] Verificar logs: `🚀 [MQTT] MODO PRODUÇÃO`
- [ ] Verificar dados sendo salvos no banco

### Para Desenvolvimento Local
- [ ] `.env` tem `MQTT_MODE=development`
- [ ] `.env` tem `INSTANCE_ID=local-dev-<seu-nome>`
- [ ] Verificar logs: `🔧 [MQTT] MODO DESENVOLVIMENTO`
- [ ] Verificar que dados **NÃO** estão sendo salvos

### Para CI/CD
- [ ] `.env.test` tem `MQTT_MODE=disabled`
- [ ] Testes passam sem erros de conexão MQTT

---

## 🎯 Vantagens desta Solução

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Desenvolvimento** | Bloqueado (MQTT_ENABLED=false) | Flexível (modo dev) |
| **Teste de UI** | Impossível | Possível (WebSocket funciona) |
| **Debug de dados** | Difícil | Fácil (logs detalhados) |
| **Conflito de dados** | Possível | Zero (dev não salva) |
| **Segurança produção** | Média | Alta (modo explícito) |

---

## 🚨 IMPORTANTE

### ⚠️ **NUNCA** rode 2 instâncias em modo `production` simultaneamente!

**Cenário perigoso:**
```bash
# Servidor VPS
MQTT_MODE=production ❌

# Seu local
MQTT_MODE=production ❌

# Resultado: Conflito de dados!
```

**Cenário correto:**
```bash
# Servidor VPS
MQTT_MODE=production ✅

# Seu local
MQTT_MODE=development ✅

# Resultado: Zero conflitos!
```

---

## 💡 Dicas de Uso

### 1. Use um `INSTANCE_ID` único e descritivo
```bash
# ❌ Ruim
INSTANCE_ID=local

# ✅ Bom
INSTANCE_ID=local-dev-pedro-feature-dashboard
```

### 2. Mantenha `.env.example` atualizado
```bash
# .env.example
MQTT_MODE=development
INSTANCE_ID=local-dev-<seu-nome>
```

### 3. Use variáveis de ambiente para debug temporário
```bash
# Ativar logs MQTT detalhados em dev
DEBUG_MQTT=true npm run start:dev
```

---

## 📞 FAQ

**P: Posso ter 2 devs em modo `development` ao mesmo tempo?**
R: ✅ Sim! Nenhum salva no banco, então não há conflito.

**P: O WebSocket funciona em modo `development`?**
R: ✅ Sim! Dados são emitidos normalmente, apenas não salvos.

**P: Posso testar salvar dados localmente?**
R: ⚠️ Sim, mas use `MQTT_MODE=production` e **DESLIGUE** o servidor de produção primeiro!

**P: Como sei qual modo está ativo?**
R: Veja os logs ao iniciar o backend. A primeira linha indica o modo.

---

---

## 🎉 RESUMO DAS MUDANÇAS

### Arquivos Modificados:
1. ✅ [src/shared/mqtt/mqtt.service.ts](src/shared/mqtt/mqtt.service.ts)
   - Método `connect()`: Adicionada lógica de 3 modos
   - Método `flushBuffer()`: Modo development não salva no banco
   - Método `salvarDadosM160Resumo()`: Modo development não salva no banco

2. ✅ [.env.example](.env.example)
   - Adicionada variável `MQTT_MODE` com documentação
   - Adicionada variável `INSTANCE_ID` com documentação

### Como Usar:

**No servidor de produção (VPS):**
```bash
MQTT_MODE=production
INSTANCE_ID=production-server
```

**No ambiente de desenvolvimento local:**
```bash
MQTT_MODE=development
INSTANCE_ID=local-dev-seu-nome
```

**Em testes ou CI/CD:**
```bash
MQTT_MODE=disabled
INSTANCE_ID=ci-tests
```

### Benefícios:
✅ Permite desenvolvimento local de features MQTT sem afetar dados de produção
✅ Zero risco de conflito de dados entre múltiplas instâncias
✅ WebSocket continua funcionando em modo development (UI atualiza em tempo real)
✅ Logs detalhados para debug em modo development
✅ Flexibilidade total para diferentes ambientes

---

**Data:** 29/12/2024
**Versão:** 2.0.0 (Modos flexíveis)
**Status:** ✅ IMPLEMENTADO E TESTADO
