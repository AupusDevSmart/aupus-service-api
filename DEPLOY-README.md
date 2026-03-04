# 🚀 Deploy - Aupus Service API

Guia completo para deploy da API com suporte a MQTT, WebSocket e Webhooks.

## 📋 Pré-requisitos

- Node.js v18+ instalado
- PM2 instalado globalmente (`npm install -g pm2`)
- Nginx configurado
- Acesso ao broker MQTT (72.60.158.163:1883)
- PostgreSQL database configurado

## 🔧 Configuração Inicial

### 1. Variáveis de Ambiente

Certifique-se de ter o arquivo `.env` configurado com:

```bash
# Banco de dados
DATABASE_URL="postgresql://username:password@host:5432/database?schema=public"

# API
NODE_ENV="production"
PORT=3000

# Segurança
JWT_SECRET="your-secret-key"

# MQTT (Dados em Tempo Real)
MQTT_HOST=72.60.158.163
MQTT_PORT=1883
MQTT_USERNAME=root
MQTT_PASSWORD=your_password
```

### 2. Estrutura PM2

A aplicação roda em **fork mode** (não cluster) porque:
- ✅ MQTT precisa de conexões persistentes
- ✅ WebSocket precisa de estado compartilhado
- ✅ Evita problemas de sincronização entre workers

## 🚀 Deploy Automático

Execute o script de deploy:

```bash
cd /var/www/aupus-service-api
./deploy.sh
```

O script faz automaticamente:
1. ✅ Backup do `.env`
2. ✅ `git pull` para atualizar código
3. ✅ Restaura `.env`
4. ✅ `npm install` (dependências)
5. ✅ `npm run build` (compilação TypeScript)
6. ✅ Reinicia/inicia PM2
7. ✅ Salva configuração PM2

## 🔄 Deploy Manual

Se preferir fazer passo a passo:

```bash
# 1. Navegar para o diretório
cd /var/www/aupus-service-api

# 2. Atualizar código
git pull origin main

# 3. Instalar dependências
npm install

# 4. Build
npm run build

# 5. Reiniciar com PM2
pm2 reload aupus-service-api --update-env
# OU se for primeira vez:
pm2 start ecosystem.config.js

# 6. Salvar configuração
pm2 save
```

## 🔍 Monitoramento

### Ver logs em tempo real
```bash
pm2 logs aupus-service-api
```

### Ver status
```bash
pm2 status
```

### Monitorar recursos
```bash
pm2 monit
```

### Ver últimos 50 logs
```bash
pm2 logs aupus-service-api --lines 50
```

## 🐛 Troubleshooting

### MQTT não conecta

1. Verificar variáveis de ambiente:
```bash
cat /var/www/aupus-service-api/.env | grep MQTT
```

2. Testar conexão manualmente:
```bash
npm install -g mqtt
mqtt sub -h 72.60.158.163 -p 1883 -u root -P your_password -t 'test/#'
```

3. Ver logs de conexão:
```bash
pm2 logs aupus-service-api | grep MQTT
```

### WebSocket não funciona

1. Verificar nginx está com configuração correta:
```bash
nginx -t
```

2. Ver headers WebSocket no navegador (DevTools > Network > WS)

3. Testar endpoint:
```bash
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  https://aupus-service-api.aupusenergia.com.br/socket.io/
```

### Aplicação crashando

1. Ver logs de erro:
```bash
pm2 logs aupus-service-api --err
```

2. Reiniciar limpo:
```bash
pm2 delete aupus-service-api
pm2 start ecosystem.config.js
```

3. Verificar memória:
```bash
pm2 status
# Se > 1G, vai reiniciar automaticamente (max_memory_restart)
```

## 📊 Endpoints Importantes

- **API Base**: `https://aupus-service-api.aupusenergia.com.br/api/v1`
- **Swagger Docs**: `https://aupus-service-api.aupusenergia.com.br/api/docs`
- **Health Check**: `https://aupus-service-api.aupusenergia.com.br/health`
- **WebSocket**: `wss://aupus-service-api.aupusenergia.com.br/socket.io/`
- **Webhooks**: `https://aupus-service-api.aupusenergia.com.br/api/v1/webhooks/*`

## 🏗️ Arquitetura

```
┌─────────────────┐
│   Internet      │
└────────┬────────┘
         │
         │ HTTPS
         ▼
┌─────────────────┐
│  Nginx (443)    │  ← Proxy reverso
│  - WebSocket    │  ← Upgrade headers
│  - Webhooks     │  ← 50MB max body
└────────┬────────┘
         │
         │ HTTP :3000
         ▼
┌─────────────────┐
│  NestJS API     │  ← PM2 (fork mode)
│  - REST         │
│  - WebSocket    │  ← Socket.io
└────────┬────────┘
         │
         ├──────────────┐
         │              │
         ▼              ▼
┌──────────────┐  ┌──────────────┐
│ PostgreSQL   │  │ MQTT Broker  │
│ 45.55.122.87 │  │ 72.60.158.163│
└──────────────┘  └──────────────┘
```

## 🔐 Segurança

- ✅ HTTPS via Let's Encrypt
- ✅ Security headers no Nginx
- ✅ CORS configurado
- ✅ JWT para autenticação
- ✅ Body size limit (50MB)
- ✅ Timeouts configurados

## 📝 Comandos Úteis PM2

```bash
# Reiniciar
pm2 restart aupus-service-api

# Parar
pm2 stop aupus-service-api

# Deletar
pm2 delete aupus-service-api

# Reload (zero-downtime) - NÃO USAR com fork mode!
pm2 reload aupus-service-api

# Ver informações detalhadas
pm2 show aupus-service-api

# Limpar logs
pm2 flush aupus-service-api
```

## 🎯 Boas Práticas

1. **Sempre use o script de deploy** (`./deploy.sh`)
2. **Nunca commite o `.env`** (já está no .gitignore)
3. **Verifique logs após deploy** (`pm2 logs`)
4. **Teste conexão MQTT** após deploy
5. **Monitore memória** (limite 1GB)

## 📞 Suporte

Em caso de problemas:
1. Verificar logs: `pm2 logs aupus-service-api`
2. Verificar status: `pm2 status`
3. Verificar nginx: `nginx -t && systemctl status nginx`
4. Verificar conectividade MQTT/DB
