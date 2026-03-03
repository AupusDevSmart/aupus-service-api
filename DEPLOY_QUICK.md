# 🚀 Deploy Rápido - Guia Passo a Passo

## ⚡ Resumo Ultra Rápido

```bash
# 1. No seu PC - Commit e Push
git add .
git commit -m "feat: adicionar monitoramento"
git push origin main

# 2. No Servidor - Deploy
ssh usuario@servidor
cd aupus-service-api
git pull
chmod +x deploy.sh
./deploy.sh
```

**Pronto!** A aplicação está no ar.

---

## 📋 Checklist Antes do Primeiro Deploy

### 1. Criar Conta no Sentry (5 minutos)
1. Acesse https://sentry.io/
2. Crie conta gratuita
3. Crie projeto tipo "Node.js"
4. Copie o **DSN** (ex: `https://abc@sentry.io/123`)

### 2. Configurar .env.production no Servidor

No servidor, criar arquivo `.env.production`:

```bash
cd aupus-service-api
nano .env.production
```

Cole e ajuste:

```env
# BANCO DE DADOS
DATABASE_URL="postgresql://admin:password@45.55.122.87:5432/aupus?schema=public"

# SEGURANÇA
JWT_SECRET="sua-chave-segura-aqui"  # Gerar: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# SENTRY (OBRIGATÓRIO!)
SENTRY_DSN="https://seu-dsn@sentry.io/projeto"

# OPCIONAL
NODE_ENV=production
LOG_LEVEL=info
SLOW_QUERY_THRESHOLD=1000
```

Salvar: `Ctrl+X` → `Y` → `Enter`

---

## 🎯 Deploy Passo a Passo

### Primeira Vez

#### No seu PC:

```bash
# 1. Ir para a pasta do projeto
cd aupus-service-api

# 2. Adicionar tudo ao Git
git add .

# 3. Fazer commit
git commit -m "feat: adicionar Sentry, logging e monitoramento"

# 4. Push para GitHub
git push origin main
```

#### No Servidor:

```bash
# 1. Conectar ao servidor
ssh usuario@seu-servidor.com

# 2. Ir para a pasta (ou clonar se for primeira vez)
cd aupus-service-api
# Se não existir: git clone https://github.com/seu-repo/aupus-service.git

# 3. Atualizar código
git pull origin main

# 4. Configurar .env.production (ver seção anterior)
nano .env.production

# 5. Tornar script executável
chmod +x deploy.sh

# 6. Executar deploy
./deploy.sh
```

O script vai:
- ✅ Verificar configurações
- ✅ Parar containers antigos
- ✅ Fazer build
- ✅ Iniciar aplicação
- ✅ Verificar health

### Atualizações Futuras

**No PC:**
```bash
git add .
git commit -m "sua mensagem"
git push
```

**No Servidor:**
```bash
ssh usuario@servidor
cd aupus-service-api
git pull
./deploy.sh
```

---

## 🔍 Verificar se Está Funcionando

```bash
# 1. Ver logs
docker-compose -f docker-compose.production.yml logs -f app

# 2. Health check
curl http://localhost/api/v1/health

# 3. Ver métricas
curl http://localhost/api/v1/health/metrics/database

# 4. Acessar Swagger
# No navegador: http://seu-servidor/api/docs
```

---

## 🆘 Problemas Comuns

### Container não inicia

```bash
# Ver erro
docker-compose -f docker-compose.production.yml logs app

# Rebuild forçado
docker-compose -f docker-compose.production.yml down -v
docker-compose -f docker-compose.production.yml up -d --build
```

### Sentry não está funcionando

```bash
# Verificar DSN
docker exec aupus-api-production env | grep SENTRY_DSN

# Ver logs de inicialização
docker-compose -f docker-compose.production.yml logs app | grep -i sentry
```

Deve aparecer: `✅ Sentry inicializado`

### Porta 80 já está em uso

```bash
# Descobrir o que está usando
sudo lsof -i :80

# Parar serviço (ex: nginx)
sudo systemctl stop nginx

# Ou mudar porta no docker-compose.production.yml:
# ports:
#   - "3001:3000"  # Usar porta 3001
```

---

## 📊 Comandos Úteis

```bash
# Ver logs em tempo real
npm run docker:production:logs

# Reiniciar aplicação
docker-compose -f docker-compose.production.yml restart app

# Parar tudo
docker-compose -f docker-compose.production.yml down

# Ver status
docker ps

# Entrar no container
docker exec -it aupus-api-production sh
```

---

## 🔐 Segurança Importante

**NUNCA commitar no Git:**
- ❌ `.env`
- ❌ `.env.production`
- ❌ Senhas ou tokens

**Já está no .gitignore, mas conferir!**

---

## 📈 Depois do Deploy

1. **Testar a API**: http://seu-servidor/api/docs
2. **Ver Sentry**: https://sentry.io/ (ver erros em tempo real)
3. **Monitorar métricas**: http://seu-servidor/api/v1/health/metrics/database
4. **Configurar alertas** no Sentry para erros críticos

---

## 🎉 Pronto!

Sua aplicação está rodando com:
- ✅ Monitoramento de erros (Sentry)
- ✅ Logging estruturado (Pino)
- ✅ Medição de queries (Prisma)
- ✅ Health checks
- ✅ Métricas em tempo real

**Qualquer dúvida, ver:** [DEPLOY.md](docs/DEPLOY.md) (guia completo)
