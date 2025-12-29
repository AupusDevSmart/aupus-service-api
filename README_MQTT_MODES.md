# 🎮 Sistema de 3 Modos MQTT - Guia Rápido

## 🚦 Escolha o Modo Certo

```
┌─────────────────────────────────────────────────────────────────┐
│                    QUAL MODO USAR?                              │
└─────────────────────────────────────────────────────────────────┘

┌───────────────────┐
│ Servidor de       │──────> MQTT_MODE=production
│ Produção (VPS)    │        INSTANCE_ID=production-server
└───────────────────┘        ✅ Conecta + Salva dados

┌───────────────────┐
│ Desenvolvimento   │──────> MQTT_MODE=development
│ Local             │        INSTANCE_ID=local-dev-seu-nome
└───────────────────┘        ✅ Conecta + NÃO salva (apenas loga)

┌───────────────────┐
│ Testes / CI/CD    │──────> MQTT_MODE=disabled
│                   │        INSTANCE_ID=ci-tests
└───────────────────┘        ❌ NÃO conecta ao MQTT
```

---

## ⚡ Setup Rápido (3 passos)

### 1. Copie o `.env.example`
```bash
cp .env.example .env
```

### 2. Configure o modo desejado no `.env`

**Para desenvolvimento local:**
```bash
MQTT_MODE=development
INSTANCE_ID=local-dev-seu-nome
```

**Para produção:**
```bash
MQTT_MODE=production
INSTANCE_ID=production-server
```

### 3. Inicie o backend
```bash
npm run start:dev
```

---

## 🎯 O Que Cada Modo Faz?

### 🚀 PRODUCTION
```
MQTT Broker ──> Backend ──> Database ✅
                   │
                   └──────> WebSocket ──> Frontend
```
- ✅ Conecta ao broker MQTT
- ✅ Recebe mensagens dos equipamentos
- ✅ **SALVA dados no banco**
- ✅ Emite eventos WebSocket

**Quando usar:** Apenas no servidor principal de produção

---

### 🔧 DEVELOPMENT
```
MQTT Broker ──> Backend ──X Database ❌
                   │
                   ├──────> Logs (console) 📋
                   └──────> WebSocket ──> Frontend
```
- ✅ Conecta ao broker MQTT
- ✅ Recebe mensagens dos equipamentos
- ❌ **NÃO SALVA dados no banco** (apenas loga)
- ✅ Emite eventos WebSocket

**Quando usar:** Desenvolvimento local de features MQTT

---

### ⏸️ DISABLED
```
MQTT Broker ──X Backend ──X Database
                   │
                   └──────> Apenas APIs REST
```
- ❌ NÃO conecta ao broker MQTT
- ❌ NÃO processa dados MQTT
- ✅ Backend funciona normalmente (APIs REST)

**Quando usar:** Testes automatizados ou CI/CD

---

## 📋 Checklist de Configuração

### ✅ Para Produção (VPS)
- [ ] `.env` tem `MQTT_MODE=production`
- [ ] `.env` tem `INSTANCE_ID=production-server`
- [ ] Logs mostram: `🚀 [MQTT] MODO PRODUÇÃO`
- [ ] Dados estão sendo salvos no banco
- [ ] **NENHUMA outra instância** em modo production

### ✅ Para Desenvolvimento Local
- [ ] `.env` tem `MQTT_MODE=development`
- [ ] `.env` tem `INSTANCE_ID=local-dev-<seu-nome>`
- [ ] Logs mostram: `🔧 [MQTT] MODO DESENVOLVIMENTO`
- [ ] Logs mostram: `📨 [DEV] Buffer flush simulado (não salva)`
- [ ] Frontend recebe dados via WebSocket
- [ ] **Dados NÃO estão sendo salvos** no banco

---

## ⚠️ REGRA CRÍTICA

### ❌ NUNCA FAÇA ISSO:
```bash
# Servidor de produção
MQTT_MODE=production  ❌

# Seu computador local
MQTT_MODE=production  ❌

# Resultado: CONFLITO DE DADOS! 💥
```

### ✅ SEMPRE FAÇA ASSIM:
```bash
# Servidor de produção
MQTT_MODE=production  ✅

# Seu computador local
MQTT_MODE=development ✅

# Resultado: Zero conflitos! 🎉
```

---

## 🧪 Como Testar Se Está Funcionando

### Teste 1: Modo Development
```bash
# 1. Configure .env
MQTT_MODE=development
INSTANCE_ID=teste-local

# 2. Inicie backend
npm run start:dev

# 3. Verifique logs - deve mostrar:
🔧 [MQTT] MODO DESENVOLVIMENTO - Instância: teste-local
🔧 [MQTT] Conectará ao MQTT mas NÃO salvará dados no banco
✅ [MQTT] Conectado com sucesso!
📨 [DEV] Buffer flush simulado (não salva): { ... }

# 4. Abra o frontend e veja dados atualizando em tempo real
# 5. Verifique no banco - NÃO deve ter novos dados ✅
```

### Teste 2: Modo Disabled
```bash
# 1. Configure .env
MQTT_MODE=disabled
INSTANCE_ID=teste-disabled

# 2. Inicie backend
npm run start:dev

# 3. Verifique logs - deve mostrar:
⏸️ [MQTT] DESABILITADO para instância: teste-disabled
⏸️ [MQTT] Dados MQTT NÃO serão processados nesta instância

# 4. Backend deve funcionar normalmente (sem MQTT)
```

---

## 💡 Exemplos de Uso

### Exemplo 1: Desenvolvendo Dashboard
```bash
# Situação: Criando uma nova dashboard que mostra dados MQTT

# .env
MQTT_MODE=development
INSTANCE_ID=dev-dashboard-nova

# O que acontece:
✅ Recebe dados MQTT do broker
✅ Frontend atualiza em tempo real (WebSocket)
✅ Você vê os dados na UI
❌ Não salva no banco (produção não é afetada)
```

### Exemplo 2: Testando Parser de M160
```bash
# Situação: Debugando o parser de dados do medidor M160

# .env
MQTT_MODE=development
INSTANCE_ID=dev-parser-m160

# Adicione logs temporários em mqtt.service.ts:
if (process.env.MQTT_MODE === 'development') {
  console.log('🔍 JSON MQTT completo:', JSON.stringify(dados, null, 2));
}

# O que acontece:
✅ Vê todos os JSONs recebidos nos logs
✅ Testa mudanças no parser
✅ Debug facilitado
❌ Não salva (pode testar à vontade)
```

### Exemplo 3: Rodando Testes
```bash
# Situação: CI/CD executando testes automatizados

# .env.test
MQTT_MODE=disabled
INSTANCE_ID=github-actions-ci

# O que acontece:
✅ Backend inicia normalmente
✅ Testes rodam sem erro de MQTT
✅ CI passa verde
```

---

## 🔍 Como Saber Qual Modo Está Ativo?

Veja a **primeira linha dos logs** ao iniciar o backend:

```bash
# PRODUCTION
🚀 [MQTT] MODO PRODUÇÃO - Instância: production-server

# DEVELOPMENT
🔧 [MQTT] MODO DESENVOLVIMENTO - Instância: local-dev-pedro

# DISABLED
⏸️ [MQTT] DESABILITADO para instância: ci-tests
```

---

## 📚 Documentação Completa

- **Guia Detalhado:** [MQTT_MODES_GUIDE.md](MQTT_MODES_GUIDE.md)
- **Resumo da Implementação:** [MQTT_MODES_IMPLEMENTATION_SUMMARY.md](MQTT_MODES_IMPLEMENTATION_SUMMARY.md)
- **Changelog Técnico:** [CHANGELOG_FIX_MQTT.md](CHANGELOG_FIX_MQTT.md)

---

## 🆘 FAQ Rápido

**P: Posso ter múltiplos devs em modo `development` ao mesmo tempo?**
**R:** ✅ Sim! Nenhum salva no banco, então não há conflito.

**P: O WebSocket funciona em modo `development`?**
**R:** ✅ Sim! Dados são emitidos normalmente, só não são salvos.

**P: Como testo salvar dados localmente?**
**R:** ⚠️ Use `MQTT_MODE=production` mas **DESLIGUE o servidor de produção primeiro!**

**P: Esqueci qual modo estou usando. Como verifico?**
**R:** Veja os logs ao iniciar o backend. A primeira linha indica o modo.

---

**Versão:** 2.0.0
**Data:** 29/12/2024
**Status:** ✅ PRONTO PARA USO
