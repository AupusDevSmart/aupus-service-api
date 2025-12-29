# 🚀 Guia de Deploy - Backend Aupus API

**Última atualização:** 29/12/2024
**Versão:** 2.0 (com melhorias MQTT Fase 1)

---

## 📋 Índice

1. [Pré-requisitos](#pré-requisitos)
2. [Deploy Inicial (Primeira vez)](#deploy-inicial-primeira-vez)
3. [Deploy de Atualizações](#deploy-de-atualizações)
4. [Configuração de Ambiente](#configuração-de-ambiente)
5. [Monitoramento Pós-Deploy](#monitoramento-pós-deploy)
6. [Rollback](#rollback)
7. [Troubleshooting](#troubleshooting)

---

## 🎯 Pré-requisitos

### No Servidor (VPS)

Certifique-se de que o servidor tem:

```bash
# Node.js 18+
node --version  # v18.x.x ou superior

# npm ou yarn
npm --version

# PM2 (gerenciador de processos)
pm2 --version

# PostgreSQL 14+
psql --version

# Git
git --version
```

### Instalar dependências faltantes:

```bash
# Node.js 18.x (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2
sudo npm install -g pm2

# PostgreSQL (se não instalado)
sudo apt-get install -y postgresql postgresql-contrib
```

---

## 🚀 DEPLOY INICIAL (Primeira vez)

### 1. Conectar ao Servidor

```bash
ssh user@seu-vps-ip
```

### 2. Clonar Repositório

```bash
cd /home/user  # ou /var/www ou seu diretório preferido

git clone https://github.com/seu-usuario/aupus-service.git
# Ou se já tiver o código, fazer upload via scp/rsync

cd aupus-service/aupus-service-api
```

### 3. Instalar Dependências

```bash
npm install --production

# Ou se usar yarn:
yarn install --production
```

### 4. Configurar Banco de Dados

#### 4.1. Criar banco de dados

```bash
sudo -u postgres psql

# No console do PostgreSQL:
CREATE DATABASE aupus;
CREATE USER aupus_user WITH ENCRYPTED PASSWORD 'senha-segura-aqui';
GRANT ALL PRIVILEGES ON DATABASE aupus TO aupus_user;

# Sair:
\q
```

#### 4.2. Configurar .env

```bash
# Copiar exemplo
cp .env.example .env

# Editar
nano .env
```

**Configuração CRÍTICA do .env:**

```bash
# === BANCO DE DADOS ===
DATABASE_URL="postgresql://aupus_user:senha-segura-aqui@localhost:5432/aupus?schema=public"

# === AMBIENTE ===
NODE_ENV="production"
PORT=3000

# === SEGURANÇA ===
# Gerar com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET="sua-chave-jwt-super-secreta-64-caracteres-aqui"

# === MQTT BROKER ===
MQTT_HOST=72.60.158.163  # IP do broker MQTT
MQTT_PORT=1883
MQTT_USERNAME=root
MQTT_PASSWORD=sua-senha-mqtt

# === MODO MQTT (CRÍTICO!) ===
# production - Conecta ao MQTT e SALVA dados no banco (USAR NO SERVIDOR PRINCIPAL)
# development - Conecta ao MQTT mas NÃO salva dados (para dev local)
# disabled - NÃO conecta ao MQTT (para testes)
MQTT_MODE=production

# === IDENTIFICAÇÃO DA INSTÂNCIA ===
# IMPORTANTE: Use ID único para cada servidor/instância
INSTANCE_ID=production-server-vps-1

# === CORS (Opcional) ===
CORS_ORIGIN="http://seu-frontend-url.com,https://seu-frontend-url.com"
```

**⚠️ IMPORTANTE:**
- Apenas **UMA** instância deve ter `MQTT_MODE=production`!
- Use `INSTANCE_ID` único para identificar cada servidor

### 5. Executar Migrações do Banco

```bash
# Gerar cliente Prisma
npx prisma generate

# Aplicar migrações
npx prisma migrate deploy

# Ou se não tiver migrações, fazer push do schema:
npx prisma db push
```

### 6. Compilar TypeScript (se aplicável)

```bash
npm run build

# Verificar se pasta dist/ foi criada
ls -la dist/
```

### 7. Configurar PM2

#### 7.1. Criar arquivo de configuração PM2

```bash
nano ecosystem.config.js
```

**Conteúdo:**

```javascript
module.exports = {
  apps: [{
    name: 'aupus-api',
    script: './dist/main.js',  // ou 'npm run start:prod'
    instances: 1,
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    merge_logs: true,
  }]
};
```

#### 7.2. Criar pasta de logs

```bash
mkdir -p logs
```

#### 7.3. Iniciar com PM2

```bash
pm2 start ecosystem.config.js

# Verificar status
pm2 status

# Deve mostrar:
# ┌─────┬──────────────┬─────────────┬─────────┬─────────┬──────────┐
# │ id  │ name         │ mode        │ ↺      │ status  │ cpu      │
# ├─────┼──────────────┼─────────────┼─────────┼─────────┼──────────┤
# │ 0   │ aupus-api    │ cluster     │ 0       │ online  │ 0%       │
# └─────┴──────────────┴─────────────┴─────────┴─────────┴──────────┘
```

#### 7.4. Salvar configuração PM2

```bash
# Salvar para reiniciar automaticamente após reboot
pm2 save

# Configurar startup script
pm2 startup

# Executar o comando que aparecer (algo como):
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u user --hp /home/user
```

### 8. Verificar Health Check

```bash
# Health geral
curl http://localhost:3000/health

# Deve retornar JSON com status: "healthy"

# MQTT específico
curl http://localhost:3000/health/mqtt

# Deve retornar:
# {
#   "status": "healthy",
#   "checks": {
#     "mqtt": {
#       "status": "connected",
#       "subscribedTopics": XX
#     }
#   }
# }
```

### 9. Configurar Firewall

```bash
# Permitir porta 3000 (ou a porta configurada)
sudo ufw allow 3000/tcp

# Se usar Nginx como proxy reverso (recomendado):
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### 10. Configurar Nginx (Opcional mas Recomendado)

```bash
# Instalar Nginx
sudo apt-get install -y nginx

# Criar configuração
sudo nano /etc/nginx/sites-available/aupus-api
```

**Conteúdo:**

```nginx
server {
    listen 80;
    server_name api.seu-dominio.com;  # ou seu-vps-ip

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }
}
```

**Ativar site:**

```bash
sudo ln -s /etc/nginx/sites-available/aupus-api /etc/nginx/sites-enabled/
sudo nginx -t  # Testar configuração
sudo systemctl restart nginx
```

---

## 🔄 DEPLOY DE ATUALIZAÇÕES

### Opção 1: Deploy Manual (Simples)

```bash
# 1. SSH no servidor
ssh user@seu-vps-ip

# 2. Ir para o diretório do projeto
cd /home/user/aupus-service/aupus-service-api

# 3. Fazer backup do .env (por precaução)
cp .env .env.backup

# 4. Atualizar código
git pull origin main
# Ou fazer upload manual dos arquivos

# 5. Instalar novas dependências (se houver)
npm install --production

# 6. Executar migrações (se houver)
npx prisma migrate deploy

# 7. Recompilar (se alterou TypeScript)
npm run build

# 8. Reiniciar PM2
pm2 restart aupus-api

# 9. Verificar logs
pm2 logs aupus-api --lines 50

# 10. Verificar health
curl http://localhost:3000/health
```

### Opção 2: Deploy com Zero Downtime

```bash
# 1-6. Mesmos passos acima

# 7. Reload ao invés de restart (zero downtime)
pm2 reload aupus-api

# 8. Verificar
pm2 logs aupus-api --lines 30
```

### Opção 3: Deploy Automatizado (Script)

Criar arquivo `deploy.sh`:

```bash
#!/bin/bash

set -e  # Parar se houver erro

echo "🚀 Iniciando deploy..."

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Backup do .env
echo "📦 Backup do .env..."
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# 2. Atualizar código
echo "📥 Atualizando código..."
git pull origin main || { echo -e "${RED}Erro ao fazer git pull${NC}"; exit 1; }

# 3. Instalar dependências
echo "📚 Instalando dependências..."
npm install --production

# 4. Migrações
echo "🗄️ Executando migrações..."
npx prisma migrate deploy

# 5. Build
echo "🔨 Compilando..."
npm run build

# 6. Reload PM2
echo "🔄 Reiniciando serviço..."
pm2 reload aupus-api

# 7. Aguardar 5 segundos
echo "⏳ Aguardando inicialização..."
sleep 5

# 8. Health check
echo "🏥 Verificando saúde do sistema..."
HEALTH=$(curl -s http://localhost:3000/health | jq -r '.status')

if [ "$HEALTH" == "healthy" ]; then
    echo -e "${GREEN}✅ Deploy concluído com sucesso!${NC}"
    echo "📊 Verificando MQTT..."
    curl -s http://localhost:3000/health/mqtt | jq
else
    echo -e "${RED}❌ Deploy falhou! Sistema não está healthy.${NC}"
    echo "📋 Últimos logs:"
    pm2 logs aupus-api --lines 20 --nostream
    exit 1
fi
```

**Usar o script:**

```bash
chmod +x deploy.sh
./deploy.sh
```

---

## ⚙️ CONFIGURAÇÃO DE AMBIENTE

### Variáveis Importantes

| Variável | Valor Produção | Valor Dev | Descrição |
|----------|---------------|-----------|-----------|
| `NODE_ENV` | `production` | `development` | Ambiente de execução |
| `MQTT_MODE` | `production` | `development` | Modo MQTT (CRÍTICO!) |
| `INSTANCE_ID` | `production-server-vps-1` | `local-dev-nome` | Identificador único |
| `DATABASE_URL` | `postgresql://...` | `postgresql://...` | String de conexão |
| `JWT_SECRET` | `chave-secreta-64-chars` | `dev-secret` | Chave JWT |

### Validar Configuração

```bash
# Verificar se .env está correto
cat .env | grep -E "MQTT_MODE|INSTANCE_ID|NODE_ENV"

# Deve mostrar:
# NODE_ENV=production
# MQTT_MODE=production
# INSTANCE_ID=production-server-vps-1
```

---

## 📊 MONITORAMENTO PÓS-DEPLOY

### Checklist Pós-Deploy (Primeiros 30 minutos)

```bash
# ✅ 1. Verificar se PM2 está online
pm2 status
# Status deve ser: online

# ✅ 2. Verificar logs por erros
pm2 logs aupus-api --lines 100 | grep -i error
# Não deve ter erros críticos

# ✅ 3. Verificar conexão MQTT
pm2 logs aupus-api --lines 50 | grep MQTT
# Deve mostrar:
# ✅ [MQTT] Conectado com sucesso!
# 📡 [MQTT] Carregando XX tópicos MQTT...

# ✅ 4. Health check geral
curl http://localhost:3000/health | jq
# "status": "healthy"

# ✅ 5. Health check MQTT
curl http://localhost:3000/health/mqtt | jq
# "status": "connected"

# ✅ 6. Verificar dados chegando
curl http://localhost:3000/health/dados-recentes | jq
# "hoursSinceLastData" deve ser < 0.1 (menos de 6 min)

# ✅ 7. Verificar métricas
curl http://localhost:3000/health/metrics/simple | jq
# Deve retornar dados válidos

# ✅ 8. Verificar alertas
curl http://localhost:3000/health/alerts | jq
# Verificar se não há alertas CRITICAL recentes

# ✅ 9. Testar endpoint principal
curl http://localhost:3000/api/algum-endpoint
# Deve funcionar normalmente

# ✅ 10. Monitorar uso de recursos
pm2 monit
# CPU e Memória devem estar em níveis normais
```

### Configurar Monitoramento Contínuo

#### 1. PM2 Monitoring (Opcional - Pago)

```bash
pm2 link <SECRET_KEY> <PUBLIC_KEY>
pm2 install pm2-server-monit
```

#### 2. UptimeRobot (Grátis)

1. Criar conta em https://uptimerobot.com
2. Adicionar monitor HTTP para: `http://seu-vps-ip:3000/health`
3. Configurar alertas por email/SMS

#### 3. Logs de Alerta Automáticos

O sistema já possui cron job que verifica a cada 5 minutos e loga alertas.

**Ver alertas:**

```bash
curl http://localhost:3000/health/alerts
```

**Forçar verificação:**

```bash
curl -X POST http://localhost:3000/health/alerts/check
```

---

## 🔙 ROLLBACK

Se algo der errado após o deploy:

### Opção 1: Rollback de Código (Git)

```bash
# 1. Ver commits recentes
git log --oneline -5

# 2. Voltar para commit anterior
git reset --hard <commit-hash>

# 3. Reinstalar dependências
npm install --production

# 4. Rebuild
npm run build

# 5. Restart
pm2 restart aupus-api

# 6. Verificar
curl http://localhost:3000/health
```

### Opção 2: Restaurar Backup do .env

```bash
# Listar backups
ls -lah .env.backup*

# Restaurar
cp .env.backup.20241229_143000 .env

# Restart
pm2 restart aupus-api
```

### Opção 3: Rollback de Banco de Dados (CUIDADO!)

```bash
# Se a migração causou problemas

# 1. Ver migrações aplicadas
npx prisma migrate status

# 2. Reverter última migração (se Prisma suportar)
# ATENÇÃO: Isso pode causar perda de dados!
npx prisma migrate resolve --rolled-back <migration-name>

# 3. Ou restaurar backup do banco (se tiver)
```

---

## 🔧 TROUBLESHOOTING

### Problema: PM2 não inicia

```bash
# Ver logs de erro
pm2 logs aupus-api --err --lines 50

# Tentar iniciar manualmente para ver erro
node dist/main.js

# Verificar se porta está em uso
lsof -i :3000

# Se porta ocupada, matar processo
kill -9 <PID>
```

### Problema: Erro de conexão com banco

```bash
# Testar conexão manual
psql -U aupus_user -d aupus -h localhost

# Verificar se PostgreSQL está rodando
sudo systemctl status postgresql

# Reiniciar PostgreSQL
sudo systemctl restart postgresql

# Verificar .env
cat .env | grep DATABASE_URL
```

### Problema: MQTT não conecta

```bash
# Verificar logs
pm2 logs aupus-api --lines 100 | grep MQTT

# Testar conexão manual com broker
telnet <MQTT_HOST> <MQTT_PORT>

# Verificar firewall
sudo ufw status

# Verificar variáveis .env
cat .env | grep MQTT
```

### Problema: Erro P2002 (conflito de instâncias)

```bash
# Verificar quantas instâncias estão em modo production
ps aux | grep node

# Verificar modo MQTT
cat .env | grep MQTT_MODE

# Se múltiplas instâncias em production:
# DESLIGAR TODAS EXCETO UMA!

# Mudar para development:
nano .env
# Alterar: MQTT_MODE=development

pm2 restart aupus-api
```

### Problema: Alto uso de memória

```bash
# Ver uso de recursos
pm2 monit

# Ou
htop

# Reiniciar aplicação
pm2 restart aupus-api

# Se persistir, aumentar limite de memória
# Editar ecosystem.config.js:
# max_memory_restart: '2G'

pm2 reload aupus-api
```

---

## 📝 Checklist Final

Antes de considerar deploy concluído:

```
[ ] Código atualizado (git pull ou upload)
[ ] Dependências instaladas (npm install)
[ ] Migrações executadas (prisma migrate deploy)
[ ] Build realizado (npm run build)
[ ] PM2 reiniciado (pm2 restart/reload)
[ ] PM2 status: online
[ ] Logs sem erros críticos
[ ] MQTT conectado (verificar logs)
[ ] Health check: healthy
[ ] Dados recentes chegando (< 6 min)
[ ] Endpoints da API funcionando
[ ] Monitoramento configurado
[ ] Equipe notificada
[ ] Documentação atualizada (se necessário)
```

---

## 🎯 Próximos Passos

Após deploy bem-sucedido:

1. **Monitorar por 24h:**
   - Verificar logs periodicamente
   - Acompanhar métricas
   - Validar ingestão de dados

2. **Configurar backups automáticos:**
   ```bash
   # Cron job para backup diário do banco
   0 2 * * * pg_dump -U aupus_user aupus > /backups/aupus_$(date +\%Y\%m\%d).sql
   ```

3. **Documentar lições aprendidas:**
   - Problemas encontrados
   - Soluções aplicadas
   - Melhorias necessárias

---

**Versão:** 2.0
**Data:** 29/12/2024
**Melhorias:** Fase 1 MQTT (health checks, alertas, métricas)
