# 🐳 Guia Completo - Docker para AUPUS Service API

## 📋 O que é Docker?

Docker é uma plataforma que permite "containerizar" aplicações, ou seja, empacotar sua aplicação com todas as dependências necessárias em um container isolado que roda de forma consistente em qualquer ambiente.

**Vantagens:**
- ✅ **Consistência**: Roda igual em qualquer máquina
- ✅ **Isolamento**: Não conflita com outras aplicações
- ✅ **Facilidade**: Deploy simples em produção
- ✅ **Escalabilidade**: Fácil de replicar e escalar

---

## 🛠️ Pré-requisitos

### 1. Instalar Docker Desktop

**Windows:**
1. Baixe o [Docker Desktop](https://www.docker.com/products/docker-desktop/)
2. Execute o instalador
3. Reinicie o computador se necessário
4. Abra o Docker Desktop e aguarde inicializar

**Verificar instalação:**
```bash
docker --version
docker-compose --version
```

---

## 🚀 Como usar Docker no projeto

### 📁 Arquivos criados

O projeto agora possui:
- `Dockerfile` - Define como construir a imagem da aplicação
- `docker-compose.yml` - Aplicação + banco PostgreSQL local
- `docker-compose.dev.yml` - Apenas banco local (para desenvolvimento)
- `docker-compose.remote-db.yml` - Apenas aplicação (usa seu banco remoto atual)
- `.dockerignore` - Define arquivos a ignorar no build
- `.env.docker` - Exemplo de configuração para Docker

### 🎯 Opções de Docker disponíveis

**Você tem 3 opções conforme sua necessidade:**

#### **Opção 1: Desenvolvimento (Recomendado) 👨‍💻**
```bash
# Apenas banco local no Docker, aplicação roda normalmente
npm run docker:dev          # Iniciar banco
npm run start:dev           # Rodar aplicação local
npm run docker:dev:down     # Parar banco
```

#### **Opção 2: Usar seu banco remoto atual 🌐**
```bash
# Containerizar apenas a aplicação, mantém banco remoto
npm run docker:remote       # Iniciar aplicação no Docker
npm run docker:remote:down  # Parar aplicação
```

#### **Opção 3: Tudo local no Docker 🐳**
```bash
# Aplicação + banco PostgreSQL local
npm run docker:prod         # Iniciar tudo
npm run docker:prod:down    # Parar tudo
```

#### 5. **Ver containers rodando**
```bash
docker ps
```

#### 6. **Ver logs da aplicação**
```bash
docker-compose logs app
```

#### 7. **Reconstruir apenas a aplicação**
```bash
docker-compose build app
docker-compose up app
```

---

## 🗂️ Estrutura dos Containers

### 📊 Serviços incluídos:

| Serviço | Porta | Descrição |
|---------|-------|-----------|
| `app` | 3000 | API NestJS |
| `database` | 5432 | PostgreSQL |
| `pgadmin` | 5050 | Interface web do banco |

### 🔑 Credenciais padrão:

**Banco de dados:**
- Host: `localhost`
- Porta: `5432`
- Database: `aupus`
- Usuário: `postgres`
- Senha: `postgres123`

**PgAdmin (opcional):**
- URL: http://localhost:5050
- Email: `admin@aupus.com`
- Senha: `admin123`

---

## ⚙️ Configuração de Ambiente

### 📝 Variáveis de ambiente

Edite no `docker-compose.yml` se necessário:

```yaml
environment:
  DATABASE_URL: postgresql://postgres:postgres123@database:5432/aupus
  JWT_SECRET: your-super-secret-jwt-key-change-in-production
  CORS_ORIGIN: http://localhost:3001
```

### 🔒 **IMPORTANTE para Produção:**
- Mude `JWT_SECRET` para um valor seguro
- Use senhas fortes para o banco
- Configure CORS apropriadamente

---

## 🏃‍♂️ Guia Passo a Passo (Primeira Execução)

### 1. **Preparar o ambiente**
```bash
# Navegar para o diretório do projeto
cd C:\Users\Public\aupus-service-api

# Verificar se o Docker está rodando
docker --version
```

### 2. **Construir e iniciar**
```bash
# Construir e iniciar todos os serviços
docker-compose up --build
```

**O que acontece:**
- 📦 Baixa imagens base (Node.js, PostgreSQL)
- 🏗️ Constrói a imagem da aplicação
- 🚀 Inicia banco de dados
- 🔄 Executa migrações do Prisma
- ▶️ Inicia a API

### 3. **Aguardar inicialização**
Aguarde ver estas mensagens:
```
database_1  | database system is ready to accept connections
app_1       | [Nest] Application successfully started
```

### 4. **Testar a aplicação**
- API: http://localhost:3000
- Health check: http://localhost:3000/api/v1/health
- Swagger: http://localhost:3000/api
- PgAdmin: http://localhost:5050

---

## 🛠️ Comandos para Desenvolvimento

### 🔄 **Desenvolvimento ativo**
```bash
# Para mudanças no código, reconstruir:
docker-compose build app
docker-compose up app

# Ou fazer tudo de uma vez:
docker-compose up --build app
```

### 🗃️ **Gerenciar banco de dados**
```bash
# Executar migrações do Prisma
docker-compose exec app npx prisma migrate deploy

# Executar seed do banco
docker-compose exec app npm run db:seed

# Acessar shell do container da aplicação
docker-compose exec app sh

# Acessar shell do PostgreSQL
docker-compose exec database psql -U postgres -d aupus
```

### 🧹 **Limpeza**
```bash
# Parar e remover containers
docker-compose down

# Remover também volumes (CUIDADO: apaga dados!)
docker-compose down -v

# Remover imagens não utilizadas
docker system prune
```

---

## 🐛 Resolução de Problemas

### ❌ **Erro: "Port already in use"**
```bash
# Verificar qual processo está usando a porta
netstat -ano | findstr :3000

# Parar containers que podem estar rodando
docker-compose down
```

### ❌ **Erro: "Cannot connect to database"**
```bash
# Verificar se o banco está saudável
docker-compose ps

# Ver logs do banco
docker-compose logs database

# Aguardar o healthcheck passar
```

### ❌ **Erro: "Build failed"**
```bash
# Limpar cache do Docker
docker system prune

# Reconstruir sem cache
docker-compose build --no-cache app
```

### ❌ **Problemas com Prisma**
```bash
# Regenerar cliente Prisma
docker-compose exec app npx prisma generate

# Aplicar migrações pendentes
docker-compose exec app npx prisma migrate deploy
```

---

## 📊 Monitoramento

### 📈 **Ver status dos containers**
```bash
# Status resumido
docker-compose ps

# Informações detalhadas
docker stats

# Logs em tempo real
docker-compose logs -f app
```

### 💾 **Backup do banco**
```bash
# Fazer backup
docker-compose exec database pg_dump -U postgres aupus > backup.sql

# Restaurar backup
docker-compose exec -T database psql -U postgres aupus < backup.sql
```

---

## 🚀 Deploy em Produção

### 🔧 **Preparar para produção**

1. **Criar arquivo `.env.production`:**
```env
DATABASE_URL=postgresql://user:password@host:5432/database
JWT_SECRET=your-very-secure-jwt-secret-here
CORS_ORIGIN=https://your-frontend-domain.com
```

2. **Comando para produção:**
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 🔄 **Atualizações em produção**
```bash
# Pull da nova versão
git pull

# Reconstruir e atualizar
docker-compose build app
docker-compose up -d app

# Verificar saúde
docker-compose ps
docker-compose logs app
```

---

## 📚 Recursos Adicionais

### 🎓 **Para aprender mais:**
- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Guide](https://docs.docker.com/compose/)
- [NestJS Docker Guide](https://docs.nestjs.com/recipes/prisma#docker)

### 🆘 **Suporte:**
- Logs detalhados: `docker-compose logs -f`
- Status dos serviços: `docker-compose ps`
- Monitoramento: Docker Desktop interface

---

## ✅ Checklist Rápido

**Primeira vez:**
- [ ] Docker Desktop instalado e rodando
- [ ] Executar `docker-compose up --build`
- [ ] Aguardar todos os serviços inicializarem
- [ ] Testar http://localhost:3000/api/v1/health

**Desenvolvimento diário:**
- [ ] `docker-compose up` para iniciar
- [ ] `docker-compose down` para parar
- [ ] `docker-compose build app` após mudanças no código

**Produção:**
- [ ] Configurar variáveis de ambiente seguras
- [ ] Testar em ambiente de staging primeiro
- [ ] Monitorar logs após deploy