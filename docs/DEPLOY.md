# Guia de Deploy para Produção

Este guia descreve o processo completo para fazer deploy da aplicação em produção.

## 📋 Pré-requisitos

### No servidor de produção:
- ✅ Docker instalado
- ✅ Docker Compose instalado
- ✅ Git instalado
- ✅ Acesso SSH ao servidor
- ✅ Porta 80 liberada no firewall

### Configurações necessárias:
- ✅ Conta no Sentry (https://sentry.io/)
- ✅ Variáveis de ambiente configuradas
- ✅ Banco de dados PostgreSQL acessível

## 🚀 Processo de Deploy

### Opção 1: Deploy Manual no Servidor (Recomendado)

#### Passo 1: Preparar o Código

**No seu computador local:**

```bash
# 1. Commitar todas as alterações
cd aupus-service-api
git add .
git commit -m "feat: adicionar Sentry, logging e monitoramento de queries"

# 2. Push para o GitHub
git push origin main  # ou sua branch
```

#### Passo 2: Configurar Sentry

1. Acesse https://sentry.io/
2. Crie uma conta ou faça login
3. Crie um novo projeto:
   - Tipo: **Node.js**
   - Nome: **aupus-service-api**
4. Copie o **DSN** fornecido (algo como: `https://abc123@o123.ingest.sentry.io/456`)
5. Guarde esse DSN - você vai precisar dele

#### Passo 3: Conectar ao Servidor

```bash
# Conectar via SSH ao servidor de produção
ssh usuario@seu-servidor.com

# Ou se usar IP direto
ssh usuario@45.55.122.87
```

#### Passo 4: Atualizar o Código no Servidor

```bash
# Navegar até a pasta do projeto
cd /caminho/para/aupus-service-api

# Atualizar o código do GitHub
git pull origin main

# Se for a primeira vez, clonar o repositório:
# git clone https://github.com/seu-usuario/aupus-service.git
# cd aupus-service/aupus-service-api
```

#### Passo 5: Configurar Variáveis de Ambiente

```bash
# Criar arquivo .env para produção
nano .env.production
```

Cole o seguinte conteúdo (ajuste os valores):

```env
# === BANCO DE DADOS ===
DATABASE_URL="postgresql://admin:password@45.55.122.87:5432/aupus?schema=public"

# === APLICAÇÃO ===
NODE_ENV=production
PORT=3000

# === SEGURANÇA ===
# Gere uma chave segura: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET="sua-chave-jwt-super-segura-aqui"

# === CORS ===
CORS_ORIGIN="https://seu-frontend.com"

# === SENTRY (IMPORTANTE!) ===
SENTRY_DSN="https://abc123@o123.ingest.sentry.io/456"

# === LOGGING ===
LOG_LEVEL="info"
SLOW_QUERY_THRESHOLD=1000

# === MQTT ===
MQTT_HOST=72.60.158.163
MQTT_PORT=1883
MQTT_USERNAME=root
MQTT_PASSWORD=sua-senha-mqtt
MQTT_MODE=production
INSTANCE_ID=production-server
```

Salve e feche (Ctrl+X, depois Y, depois Enter)

#### Passo 6: Fazer o Deploy

```bash
# Parar containers antigos (se existirem)
docker-compose -f docker-compose.production.yml down

# Fazer o build e subir os containers
docker-compose -f docker-compose.production.yml up -d --build

# Ou usar o script npm:
npm run docker:production
```

#### Passo 7: Verificar o Deploy

```bash
# Ver logs em tempo real
docker-compose -f docker-compose.production.yml logs -f app

# Ou usar o script npm:
npm run docker:production:logs

# Verificar se o container está rodando
docker ps

# Testar a API
curl http://localhost/api/v1/health
```

#### Passo 8: Configurar SSL (Opcional mas Recomendado)

Se quiser usar HTTPS:

```bash
# Instalar Nginx como reverse proxy
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx

# Configurar Nginx
sudo nano /etc/nginx/sites-available/aupus-api
```

Cole:
```nginx
server {
    listen 80;
    server_name api.seu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Ativar configuração
sudo ln -s /etc/nginx/sites-available/aupus-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Obter certificado SSL
sudo certbot --nginx -d api.seu-dominio.com
```

---

### Opção 2: Deploy Automático com Script

Crie um script de deploy:

```bash
# No servidor, criar script
nano deploy.sh
```

Cole:
```bash
#!/bin/bash
set -e

echo "🚀 Iniciando deploy da aplicação..."

# Configurações
PROJECT_DIR="/caminho/para/aupus-service/aupus-service-api"
BRANCH="main"

# Navegar para o diretório
cd $PROJECT_DIR

# Atualizar código
echo "📥 Atualizando código do GitHub..."
git pull origin $BRANCH

# Instalar dependências (caso tenha alterações)
echo "📦 Instalando dependências..."
npm install --production

# Rebuild e restart dos containers
echo "🐳 Rebuilding containers..."
docker-compose -f docker-compose.production.yml down
docker-compose -f docker-compose.production.yml up -d --build

# Aguardar aplicação iniciar
echo "⏳ Aguardando aplicação iniciar..."
sleep 10

# Verificar health
echo "🏥 Verificando health..."
curl -f http://localhost/api/v1/health || {
    echo "❌ Health check falhou!"
    docker-compose -f docker-compose.production.yml logs --tail=50 app
    exit 1
}

echo "✅ Deploy concluído com sucesso!"
echo "📊 Logs: docker-compose -f docker-compose.production.yml logs -f app"
```

Tornar executável e usar:
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 🔄 Atualizações Futuras

Sempre que fizer alterações no código:

```bash
# 1. No local: commit e push
git add .
git commit -m "sua mensagem"
git push origin main

# 2. No servidor: executar deploy
ssh usuario@servidor
cd /caminho/para/aupus-service-api
./deploy.sh

# Ou manualmente:
git pull origin main
docker-compose -f docker-compose.production.yml up -d --build
```

---

## 📊 Monitoramento Pós-Deploy

### 1. Verificar Logs

```bash
# Logs em tempo real
docker-compose -f docker-compose.production.yml logs -f app

# Últimas 100 linhas
docker-compose -f docker-compose.production.yml logs --tail=100 app

# Logs de erro
docker-compose -f docker-compose.production.yml logs app | grep ERROR
```

### 2. Verificar Métricas

```bash
# Health check geral
curl http://localhost/api/v1/health

# Métricas do banco de dados
curl http://localhost/api/v1/health/metrics/database

# Status do MQTT
curl http://localhost/api/v1/health/mqtt
```

### 3. Monitorar no Sentry

1. Acesse seu dashboard do Sentry
2. Você verá erros e performance em tempo real
3. Configure alertas para erros críticos

### 4. Verificar Container

```bash
# Status do container
docker ps

# Uso de recursos
docker stats aupus-api-production

# Reiniciar se necessário
docker-compose -f docker-compose.production.yml restart app
```

---

## 🔧 Troubleshooting

### Container não inicia

```bash
# Ver logs de erro
docker-compose -f docker-compose.production.yml logs app

# Verificar se a porta está em uso
sudo lsof -i :80

# Remover containers antigos
docker-compose -f docker-compose.production.yml down -v
docker-compose -f docker-compose.production.yml up -d --build
```

### Erro de conexão com banco de dados

```bash
# Verificar conectividade
docker exec -it aupus-api-production sh
nc -zv 45.55.122.87 5432

# Verificar DATABASE_URL
docker exec aupus-api-production env | grep DATABASE_URL
```

### Sentry não está capturando erros

1. Verificar se `SENTRY_DSN` está configurado:
```bash
docker exec aupus-api-production env | grep SENTRY_DSN
```

2. Verificar logs de inicialização:
```bash
docker-compose -f docker-compose.production.yml logs app | grep Sentry
```

Deve aparecer: `✅ Sentry inicializado - Ambiente: production`

### Queries lentas não aparecem

Ajustar threshold:
```bash
# Editar .env.production
nano .env.production
# Alterar: SLOW_QUERY_THRESHOLD=500
# Reiniciar: docker-compose -f docker-compose.production.yml restart app
```

---

## 🔐 Segurança

### Checklist de Segurança:

- [ ] `JWT_SECRET` forte e único
- [ ] `SENTRY_DSN` configurado
- [ ] CORS configurado corretamente
- [ ] Firewall configurado (apenas portas necessárias abertas)
- [ ] SSL/HTTPS configurado (se aplicável)
- [ ] Senhas de banco de dados fortes
- [ ] `.env` não commitado no Git
- [ ] Backups do banco configurados

---

## 📈 Otimização

### Ajustar recursos do container

Editar `docker-compose.production.yml`:

```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'      # Aumentar CPU
      memory: 2G       # Aumentar RAM
```

### Logs persistentes

Logs já estão salvos em `./logs` no servidor.

Para rotação de logs:
```bash
# Instalar logrotate
sudo apt install logrotate

# Configurar
sudo nano /etc/logrotate.d/aupus-api
```

---

## 🆘 Suporte

### Comandos Úteis

```bash
# Reiniciar aplicação
docker-compose -f docker-compose.production.yml restart app

# Ver todas as variáveis de ambiente
docker exec aupus-api-production env

# Entrar no container
docker exec -it aupus-api-production sh

# Verificar versão do Node
docker exec aupus-api-production node --version

# Executar comando npm dentro do container
docker exec aupus-api-production npm run db:seed
```

### Links Importantes

- **Swagger Docs**: http://seu-servidor/api/docs
- **Health Check**: http://seu-servidor/api/v1/health
- **Métricas**: http://seu-servidor/api/v1/health/metrics/database
- **Sentry Dashboard**: https://sentry.io/

---

## 📝 Resumo - Deploy Rápido

```bash
# No seu PC
git add .
git commit -m "feat: monitoramento"
git push origin main

# No servidor
ssh usuario@servidor
cd aupus-service-api
git pull
docker-compose -f docker-compose.production.yml up -d --build
docker-compose -f docker-compose.production.yml logs -f app
```

**Pronto!** 🎉
