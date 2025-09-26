# 🚀 Guia de Deploy em Produção

## 🎯 Visão Geral

Este guia te mostra como fazer deploy da aplicação AUPUS em produção usando Docker com seu banco de dados remoto atual.

**Configuração de produção:**
- ✅ **Aplicação:** Containerizada no Docker
- ✅ **Banco de dados:** Seu PostgreSQL remoto atual (`45.55.122.87`)
- ✅ **Dados:** Mantém todos os dados existentes
- ✅ **Segurança:** Configurações de produção

---

## 🛠️ Opções de Deploy

### **Opção 1: Servidor próprio/VPS (Recomendado)**
- Digital Ocean, AWS EC2, Vultr, etc.
- Você controla tudo
- Mais barato para uso contínuo

### **Opção 2: Plataformas como serviço**
- Railway, Render, Fly.io
- Mais fácil, mas pode ser mais caro

### **Opção 3: Cloud providers**
- AWS ECS, Google Cloud Run, Azure Container Instances
- Escalável, mas mais complexo

---

## 🔧 Deploy em Servidor próprio/VPS

### **1. Preparar o servidor**

```bash
# Conectar ao servidor
ssh user@your-server-ip

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
sudo systemctl enable docker
sudo systemctl start docker

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verificar instalação
docker --version
docker-compose --version
```

### **2. Enviar código para o servidor**

```bash
# No seu computador local
# Comprimir projeto (excluindo node_modules e .git)
tar --exclude='node_modules' --exclude='.git' --exclude='dist' -czf aupus-api.tar.gz .

# Enviar para servidor
scp aupus-api.tar.gz user@your-server-ip:/home/user/

# No servidor
cd /home/user
tar -xzf aupus-api.tar.gz
```

### **3. Configurar variáveis de ambiente**

```bash
# No servidor
cd /home/user/aupus-service-api

# Copiar e editar arquivo de produção
cp .env.production .env.prod
nano .env.prod

# IMPORTANTE: Alterar pelo menos:
# - JWT_SECRET (gerar chave segura)
# - CORS_ORIGIN (domínio do frontend)
```

### **4. Deploy da aplicação**

```bash
# No servidor
# Fazer deploy em produção
docker-compose -f docker-compose.production.yml --env-file .env.prod up -d --build

# Verificar status
docker ps
docker logs aupus-api-production

# Verificar saúde da aplicação
curl http://localhost/api/v1/health
```

---

## 🌐 Deploy no Railway (Plataforma simples)

### **1. Preparar o projeto**

```bash
# Criar arquivo railway.json
{
  "deploy": {
    "startCommand": "npm run start:prod",
    "healthcheckPath": "/api/v1/health"
  }
}
```

### **2. Configurar no Railway**

1. **Conectar GitHub:** Subir código para GitHub
2. **Criar projeto:** railway.app → New Project → Deploy from GitHub
3. **Configurar variáveis:**
   ```
   NODE_ENV=production
   DATABASE_URL=postgresql://admin:password@45.55.122.87:5432/aupus?schema=public
   JWT_SECRET=your-super-secure-jwt-secret-here
   PORT=3000
   ```

---

## 🏃‍♂️ Deploy rápido local (teste)

Para testar o deploy localmente:

```bash
# 1. Gerar JWT secret seguro
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Editar .env.production com o secret gerado

# 3. Rodar em produção local
npm run docker:production

# 4. Testar
curl http://localhost/api/v1/health

# 5. Ver logs
npm run docker:production:logs

# 6. Parar
npm run docker:production:down
```

---

## 🔒 Configurações de Segurança

### **Variáveis obrigatórias para produção:**

```bash
# JWT Secret (CRÍTICO!)
JWT_SECRET="$(openssl rand -hex 32)"

# CORS (ajustar para seu domínio)
CORS_ORIGIN="https://meuapp.com"

# Nível de log
LOG_LEVEL="error"
```

### **Configurações do servidor:**

```bash
# Firewall básico
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable

# SSL/HTTPS (recomendado)
# Usar nginx como proxy reverso + Let's Encrypt
```

---

## 📊 Monitoramento

### **Verificar saúde:**
```bash
# Status dos containers
docker ps

# Logs da aplicação
docker logs -f aupus-api-production

# Uso de recursos
docker stats

# Health check
curl http://your-domain/api/v1/health
```

### **Comandos úteis:**
```bash
# Reiniciar aplicação
docker-compose -f docker-compose.production.yml restart app

# Atualizar código
git pull
docker-compose -f docker-compose.production.yml up -d --build

# Backup dos logs
docker logs aupus-api-production > app-logs-$(date +%Y%m%d).log
```

---

## 🔄 Atualizações

### **Deploy de nova versão:**
```bash
# No servidor
git pull origin main
docker-compose -f docker-compose.production.yml down
docker-compose -f docker-compose.production.yml up -d --build

# Verificar
docker logs -f aupus-api-production
```

---

## ❗ Checklist de Deploy

**Antes do deploy:**
- [ ] Testar aplicação localmente
- [ ] Configurar JWT_SECRET seguro
- [ ] Configurar CORS_ORIGIN correto
- [ ] Testar conexão com banco remoto
- [ ] Fazer backup do banco (se necessário)

**Durante o deploy:**
- [ ] Verificar se containers subiram
- [ ] Testar health check
- [ ] Verificar logs sem erros
- [ ] Testar endpoints principais

**Após o deploy:**
- [ ] Configurar monitoramento
- [ ] Configurar SSL/HTTPS
- [ ] Documentar processo
- [ ] Treinar equipe

---

## 🆘 Resolução de Problemas

### **Container não inicia:**
```bash
# Ver logs detalhados
docker logs aupus-api-production

# Verificar configurações
docker inspect aupus-api-production
```

### **Erro de conexão com banco:**
```bash
# Testar conexão do servidor
docker exec aupus-api-production sh -c "ping 45.55.122.87"

# Verificar variáveis de ambiente
docker exec aupus-api-production env | grep DATABASE_URL
```

### **Erro de permissão:**
```bash
# Verificar se Docker está rodando
sudo systemctl status docker

# Adicionar usuário ao grupo docker
sudo usermod -aG docker $USER
# Fazer logout/login
```

---

## 💡 Próximos passos

Após o deploy básico, considere:

1. **SSL/HTTPS:** Configurar certificado
2. **Domínio:** Apontar DNS para o servidor
3. **CDN:** Cloudflare para performance
4. **Monitoramento:** Logs centralizados
5. **Backup:** Estratégia de backup automatizado
6. **CI/CD:** Deploy automatizado

**Sua aplicação estará pronta para produção!** 🎉