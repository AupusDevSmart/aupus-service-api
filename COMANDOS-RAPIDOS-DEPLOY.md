# Comandos Rápidos - Deploy Buffer Redis

**Cola e executa na ordem!**

---

## 🖥️ NO SEU COMPUTADOR LOCAL

### 1. Commitar e Push

```bash
cd C:\Users\Public\aupus-service

# Adicionar arquivos
git add aupus-service-api/src/shared/mqtt/mqtt.service.ts
git add aupus-service-api/src/shared/mqtt/mqtt.module.ts
git add aupus-service-api/src/shared/mqtt/mqtt-redis-buffer.service.ts
git add aupus-service-api/src/shared/mqtt/mqtt-diagnostics.controller.ts
git add aupus-service-api/package.json
git add aupus-service-api/package-lock.json

# Commit
git commit -m "feat: implementar buffer Redis para prevenir perda de dados MQTT"

# Push
git push origin main
```

---

## 🌐 NA VPS (via SSH)

### 2. Instalar Redis

```bash
# Criar container Redis com persistência
docker run -d \
  --name aupus-redis \
  --restart unless-stopped \
  -p 127.0.0.1:6379:6379 \
  -v redis-data:/data \
  redis:7-alpine redis-server \
    --appendonly yes \
    --appendfsync everysec \
    --save 900 1 \
    --save 300 10 \
    --save 60 10000

# Verificar
docker ps | grep redis
docker exec aupus-redis redis-cli ping
```

### 3. Atualizar Código

```bash
# Navegar até o projeto
cd /caminho/do/seu/projeto/aupus-service-api

# Backup do .env
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# Pull
git pull origin main

# Instalar dependências
npm install
```

### 4. Configurar .env

```bash
# Editar .env
nano .env

# Adicionar estas linhas:
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Salvar: Ctrl+X, Y, Enter
```

### 5. Reiniciar Aplicação

**Se usa PM2:**
```bash
pm2 restart aupus-api
pm2 logs aupus-api --lines 50
```

**Se usa systemd:**
```bash
sudo systemctl restart aupus-api
sudo journalctl -u aupus-api -n 50 -f
```

### 6. Verificar Funcionamento

```bash
# Ver buffer (deve ser 0)
docker exec aupus-redis redis-cli LLEN mqtt:buffer:queue

# Ver logs do Redis
docker logs aupus-redis --tail 20
```

---

## ✅ Checklist Rápido

- [ ] Git push feito
- [ ] Redis rodando na VPS
- [ ] Git pull feito
- [ ] npm install executado
- [ ] .env atualizado com variáveis Redis
- [ ] Aplicação reiniciada
- [ ] Logs mostram "Redis conectado!"
- [ ] Buffer queue = 0

---

## 🧪 Teste Rápido (Opcional)

```bash
# 1. Parar PostgreSQL
docker stop aupus-db

# 2. Aguardar 30-60s (dados chegarem)

# 3. Ver buffer (deve ter itens)
docker exec aupus-redis redis-cli LLEN mqtt:buffer:queue

# 4. Reativar PostgreSQL
docker start aupus-db

# 5. Aguardar 30-60s (retry automático)

# 6. Ver buffer (deve voltar para 0)
docker exec aupus-redis redis-cli LLEN mqtt:buffer:queue
```

---

## 🚨 Se Algo Der Errado

```bash
# Ver logs da aplicação
pm2 logs aupus-api --lines 100

# Ver status Redis
docker ps | grep redis
docker logs aupus-redis

# Verificar conexão Redis
docker exec aupus-redis redis-cli ping

# Reiniciar tudo
docker restart aupus-redis
pm2 restart aupus-api
```

---

## 📊 Monitoramento

```bash
# Ver tamanho do buffer
docker exec aupus-redis redis-cli LLEN mqtt:buffer:queue

# Ver primeiros itens
docker exec aupus-redis redis-cli LRANGE mqtt:buffer:queue 0 2

# Estatísticas Redis
docker exec aupus-redis redis-cli INFO stats

# Monitorar em tempo real
docker exec aupus-redis redis-cli MONITOR
```

---

**Total: ~5 minutos de deploy** ⚡
