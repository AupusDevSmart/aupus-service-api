# 🚨 Procedimentos de Emergência - MQTT

**Última atualização:** 29/12/2024
**Versão:** 1.0

---

## 📋 Índice Rápido

1. [Sintoma: Sem dados MQTT](#sintoma-sem-dados-mqtt)
2. [Sintoma: Servidor principal offline](#sintoma-servidor-principal-offline)
3. [Sintoma: Dados parciais/incompletos](#sintoma-dados-parciaisincompletos)
4. [Sintoma: Erro P2002 (conflito de instâncias)](#sintoma-erro-p2002-conflito-de-instâncias)
5. [Monitoramento e Alertas](#monitoramento-e-alertas)
6. [Contatos de Emergência](#contatos-de-emergência)

---

## 🔴 SINTOMA: Sem Dados MQTT

### Como Identificar:
- Dashboard mostra alerta: "Dados desatualizados"
- Gráficos sem dados nas últimas 2+ horas
- Endpoint `/health/dados-recentes` retorna status `critical`

### Checklist de Diagnóstico:

#### 1. Verificar se o backend está rodando
```bash
# SSH no servidor
ssh user@vps-ip

# Verificar PM2
pm2 status

# Deve mostrar:
# aupus-api | online | ...
```

**Se offline:**
```bash
pm2 start aupus-api
pm2 logs aupus-api --lines 50
```

#### 2. Verificar logs do MQTT
```bash
pm2 logs aupus-api --lines 100 | grep MQTT

# Buscar por:
# ✅ "✅ [MQTT] Conectado com sucesso!"
# ❌ "❌ [MQTT] ERRO:"
# ❌ "🔴 [MQTT] ALERTA CRÍTICO: Broker OFFLINE!"
```

#### 3. Verificar modo MQTT
```bash
# Verificar .env
cat .env | grep MQTT_MODE

# DEVE SER: MQTT_MODE=production
# Se for development ou disabled, dados NÃO serão salvos!
```

**Se modo estiver errado:**
```bash
# Editar .env
nano .env

# Mudar para:
MQTT_MODE=production
INSTANCE_ID=production-server

# Reiniciar
pm2 restart aupus-api
pm2 logs aupus-api --lines 20
```

#### 4. Verificar broker MQTT
```bash
# Testar conexão com o broker
telnet <MQTT_HOST> <MQTT_PORT>

# Exemplo:
telnet 72.60.158.163 1883

# Se conectar, pressionar Ctrl+] depois quit
```

**Se broker offline:**
- Entrar em contato com administrador do broker
- Verificar firewall/rede

#### 5. Verificar banco de dados
```bash
# Testar endpoint de health
curl http://localhost:3000/health/database

# Deve retornar:
# { "status": "connected", ... }
```

### ⚡ Solução Rápida: Reiniciar Tudo
```bash
# 1. Reiniciar backend
pm2 restart aupus-api

# 2. Aguardar 30 segundos

# 3. Verificar logs
pm2 logs aupus-api --lines 30

# 4. Verificar health
curl http://localhost:3000/health

# 5. Verificar dados chegando
curl http://localhost:3000/health/dados-recentes
```

### 📊 Validação:
```bash
# Verificar último dado no banco
curl http://localhost:3000/health/dados-recentes

# Deve mostrar:
# "hoursSinceLastData": < 0.1 (menos de 6 minutos)
```

---

## 🔴 SINTOMA: Servidor Principal Offline

### Como Identificar:
- Servidor VPS não responde (SSH timeout)
- PM2 offline
- Infraestrutura indisponível

### ⚡ PROCEDIMENTO DE FAILOVER MANUAL

**Tempo estimado:** 5-10 minutos

#### Passo 1: Confirmar que servidor está offline
```bash
# Tentar SSH
ssh user@vps-ip

# Timeout? Servidor está offline.
```

#### Passo 2: Ativar instância de backup (local ou VPS secundário)

**No computador de backup:**

```bash
# 1. Navegar até o projeto
cd c:\Users\Public\aupus-service\aupus-service-api

# 2. Editar .env
# Mudar:
MQTT_MODE=development
# Para:
MQTT_MODE=production

# E definir:
INSTANCE_ID=backup-emergency-$(date +%Y%m%d)

# 3. Salvar e reiniciar
npm run start:dev

# Ou se usando PM2:
pm2 restart aupus-api
```

#### Passo 3: Verificar que backup assumiu
```bash
# Verificar logs
# Deve mostrar:
# 🚀 [MQTT] MODO PRODUÇÃO - Instância: backup-emergency-20241229
# ✅ [MQTT] Conectado com sucesso!
# 📡 [MQTT] Carregando N tópicos MQTT...

# Aguardar 1-2 minutos e verificar dados chegando
curl http://localhost:3000/health/dados-recentes
```

#### Passo 4: Monitorar continuamente
```bash
# Deixar logs abertos
npm run start:dev

# Ou PM2:
pm2 logs aupus-api --lines 100 -f
```

#### Passo 5: Quando servidor principal voltar

**IMPORTANTE: Evitar 2 instâncias em production simultaneamente!**

```bash
# 1. Verificar que servidor principal voltou
ssh user@vps-ip
pm2 status

# 2. Confirmar que está em modo production
cat .env | grep MQTT_MODE
# Deve ser: MQTT_MODE=production

# 3. DESATIVAR backup IMEDIATAMENTE
# No computador de backup:
# Editar .env:
MQTT_MODE=development

# Reiniciar:
pm2 restart aupus-api
# Ou Ctrl+C e npm run start:dev
```

### 📊 Validação Final:
```bash
# No servidor principal:
curl http://vps-ip:3000/health/mqtt

# No backup (deve estar em development agora):
# Logs devem mostrar:
# 🔧 [MQTT] MODO DESENVOLVIMENTO
# 📨 [DEV] Buffer flush simulado (não salva)
```

---

## 🟡 SINTOMA: Dados Parciais/Incompletos

### Como Identificar:
- Alguns equipamentos aparecem, outros não
- Gráficos com lacunas
- Métricas mostram cobertura < 50%

### Checklist de Diagnóstico:

#### 1. Verificar métricas de cobertura
```bash
curl http://localhost:3000/health/metrics

# Verificar:
# "dataIngestion": {
#   "last24h": {
#     "coverage": XX%  <-- Se < 50%, problema!
#   }
# }
```

#### 2. Verificar quais equipamentos estão enviando dados
```bash
# Query no banco (psql ou pgAdmin)
SELECT
  equipamento_id,
  COUNT(*) as total_registros,
  MAX(created_at) as ultimo_dado
FROM equipamentos_dados
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY equipamento_id
ORDER BY total_registros DESC;
```

#### 3. Verificar tópicos MQTT subscritos
```bash
curl http://localhost:3000/health/mqtt

# Verificar:
# "subscribedTopics": XX  <-- Deve ser > 0
```

#### 4. Verificar qualidade dos dados
```bash
curl http://localhost:3000/health/metrics

# Verificar:
# "quality": {
#   "last24h": {
#     "goodPercentage": XX%  <-- Ideal > 80%
#   }
# }
```

### Possíveis Causas:

1. **Equipamentos offline:**
   - Verificar fisicamente se equipamentos estão ligados
   - Verificar rede dos equipamentos

2. **Broker MQTT com problemas:**
   - Verificar logs do broker
   - Verificar se broker perdeu subscrições

3. **Buffer overflow (improvável):**
   - Verificar logs por: "Buffer muito grande"
   - Reiniciar backend para limpar buffers

### Solução:
```bash
# 1. Recarregar tópicos MQTT
pm2 restart aupus-api

# 2. Verificar logs de reconexão
pm2 logs aupus-api --lines 50 | grep "Carregando.*tópicos"

# Deve mostrar:
# 📡 [MQTT] Carregando XX tópicos MQTT...
```

---

## 🔴 SINTOMA: Erro P2002 (Conflito de Instâncias)

### Como Identificar:
- Logs mostram: `P2002: Unique constraint failed`
- Múltiplas instâncias tentando salvar dados
- Pode causar perda de dados se não tratado

### ⚠️ CAUSA:
**Duas ou mais instâncias em `MQTT_MODE=production` ao mesmo tempo!**

### Checklist de Diagnóstico:

#### 1. Identificar todas as instâncias ativas

**Servidor principal:**
```bash
ssh user@vps-ip
ps aux | grep "node.*aupus"
pm2 list
cat .env | grep MQTT_MODE
```

**Servidor backup (se houver):**
```bash
ssh user@vps-backup
# Mesmos comandos acima
```

**Computadores locais da equipe:**
```bash
# Perguntar a todos devs:
# "Quem está com MQTT_MODE=production?"
```

#### 2. Verificar logs de ambas instâncias
```bash
# Buscar por linha de início:
pm2 logs aupus-api --lines 200 | grep "MODO PRODUÇÃO"

# Se aparecer em múltiplas máquinas → CONFLITO!
```

### ⚡ SOLUÇÃO IMEDIATA:

**Regra:** Apenas 1 instância deve estar em `production`!

```bash
# 1. Decidir qual instância manter (geralmente: servidor principal)

# 2. DESLIGAR todas as outras:

# No servidor backup:
nano .env
# Mudar para:
MQTT_MODE=development

pm2 restart aupus-api

# Nos computadores locais:
# Parar backend ou mudar para development
```

### 📊 Validação:
```bash
# Após 5 minutos, verificar se erros P2002 pararam:
pm2 logs aupus-api --lines 100 | grep P2002

# Não deve aparecer nada novo
```

### 🔧 Prevenção:
- Sempre verificar modo antes de iniciar: `cat .env | grep MQTT_MODE`
- Documentar qual servidor é o principal
- Usar `INSTANCE_ID` único para cada instância

---

## 📊 MONITORAMENTO E ALERTAS

### Endpoints de Monitoramento

#### 1. Health Check Geral
```bash
curl http://localhost:3000/health

# Status 200 = healthy
# Status 503 = unhealthy
```

#### 2. MQTT Específico
```bash
curl http://localhost:3000/health/mqtt

# Retorna:
# {
#   "status": "connected" | "disconnected",
#   "subscribedTopics": XX
# }
```

#### 3. Dados Recentes
```bash
curl http://localhost:3000/health/dados-recentes

# Retorna:
# {
#   "status": "ok" | "warning" | "critical",
#   "hoursSinceLastData": XX
# }
```

#### 4. Métricas Completas
```bash
curl http://localhost:3000/health/metrics

# Retorna JSON completo com todas as métricas
```

#### 5. Histórico de Alertas
```bash
curl http://localhost:3000/health/alerts

# Retorna últimos 100 alertas do sistema
```

### Configurar Monitoramento Externo

#### Opção 1: UptimeRobot (Grátis)
```
1. Criar conta em uptimerobot.com
2. Adicionar monitor:
   - Type: HTTP(s)
   - URL: http://seu-vps-ip:3000/health
   - Interval: 5 minutes
   - Alert contacts: seu@email.com

3. Adicionar segundo monitor:
   - URL: http://seu-vps-ip:3000/health/dados-recentes
   - Keyword: "ok"
   - Alert if keyword not found
```

#### Opção 2: Cron Job + Webhook
```bash
# Criar script de verificação
cat > /home/user/check-mqtt.sh << 'EOF'
#!/bin/bash

HEALTH=$(curl -s http://localhost:3000/health/dados-recentes | jq -r '.checks.recentData.status')

if [ "$HEALTH" != "ok" ]; then
  # Enviar alerta (Slack, Telegram, etc)
  curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
    -H 'Content-Type: application/json' \
    -d '{"text":"🚨 MQTT com problemas! Status: '"$HEALTH"'"}'
fi
EOF

chmod +x /home/user/check-mqtt.sh

# Adicionar ao crontab (verificar a cada 5 minutos)
crontab -e
# Adicionar:
*/5 * * * * /home/user/check-mqtt.sh
```

### Alertas Automáticos do Backend

O sistema já possui alertas automáticos via cron job (a cada 5 minutos).

**Verificar alertas:**
```bash
# Ver histórico
curl http://localhost:3000/health/alerts

# Forçar verificação manual
curl -X POST http://localhost:3000/health/alerts/check
```

**Integrar com Slack/Email (TODO):**
```bash
# Adicionar ao .env:
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/XXX/YYY/ZZZ
ALERT_EMAIL_TO=seu@email.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu@gmail.com
SMTP_PASS=sua-senha-de-app
```

---

## 📞 CONTATOS DE EMERGÊNCIA

### Equipe Técnica
- **Dev Lead:** [Nome] - [Telefone] - [Email]
- **DevOps:** [Nome] - [Telefone] - [Email]
- **Suporte:** [Nome] - [Telefone] - [Email]

### Infraestrutura
- **VPS Provider:** [DigitalOcean/AWS/etc]
- **Suporte 24/7:** [Telefone/URL]
- **MQTT Broker:** [Responsável] - [Contato]

### Procedimento de Escalonamento

**Nível 1 (0-30 min):** Dev disponível tenta resolver
**Nível 2 (30-60 min):** Acionar Dev Lead
**Nível 3 (60+ min):** Acionar DevOps + Gerência

---

## 📝 Checklist Pós-Incidente

Após resolver qualquer incidente, preencher:

```
[ ] Incidente resolvido?
[ ] Causa raiz identificada?
[ ] Tempo de downtime: ___ minutos
[ ] Dados perdidos? Se sim, quantos?
[ ] Procedimento foi efetivo?
[ ] Precisa atualizar documentação?
[ ] Precisa melhorar monitoramento?
[ ] Equipe foi notificada?
[ ] Post-mortem agendado? (se > 1h downtime)
```

---

## 🔧 Comandos Úteis - Cheat Sheet

```bash
# === VERIFICAÇÕES RÁPIDAS ===
pm2 status                                    # Status do PM2
pm2 logs aupus-api --lines 50                # Últimos 50 logs
cat .env | grep MQTT_MODE                    # Ver modo MQTT
curl http://localhost:3000/health             # Health check
curl http://localhost:3000/health/metrics/simple  # Métricas simples

# === REINICIAR ===
pm2 restart aupus-api                        # Reiniciar backend
pm2 reload aupus-api                         # Reload zero-downtime

# === LOGS ESPECÍFICOS ===
pm2 logs aupus-api --lines 100 | grep MQTT   # Apenas logs MQTT
pm2 logs aupus-api --lines 100 | grep ERROR  # Apenas erros
pm2 logs aupus-api --lines 100 | grep P2002  # Erros de conflito

# === BANCO DE DADOS ===
psql -U postgres -d aupus -c "SELECT COUNT(*), MAX(created_at) FROM equipamentos_dados WHERE created_at > NOW() - INTERVAL '1 hour';"

# === NETWORK ===
telnet <MQTT_HOST> <MQTT_PORT>               # Testar broker MQTT
ping <MQTT_HOST>                             # Testar conectividade
```

---

**Versão:** 1.0
**Última revisão:** 29/12/2024
**Próxima revisão:** Após cada incidente ou a cada 3 meses
