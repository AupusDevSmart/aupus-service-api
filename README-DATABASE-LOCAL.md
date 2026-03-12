# Guia: Copiar Banco PostgreSQL para Ambiente Local

Este guia mostra como copiar o banco de dados PostgreSQL remoto para rodar localmente usando Docker.

## Pré-requisitos

- Docker instalado e rodando
- Docker Compose instalado

## Passo a Passo

### 1. Subir o PostgreSQL Local com Docker

```bash
docker-compose -f docker-compose.local.yml up -d
```

Isso vai criar:
- Container PostgreSQL na porta **5433** (localhost)
- Container Redis na porta **6379**
- Usuario: `postgres`
- Senha: `postgres`
- Banco: `aupus_local`

### 2. Fazer Backup do Banco Remoto

Execute o script de backup:

```bash
cd C:\Users\Public\aupus-service\aupus-service-api
.\scripts\backup-database.bat
```

Isso vai:
- Conectar no banco remoto (45.55.122.87:5432)
- Criar um arquivo `backups\backup-aupus-YYYYMMDD-HHMM.sql`
- Salvar todos os dados e estrutura

### 3. Restaurar o Backup no Banco Local

Execute o script de restauração:

```bash
.\scripts\restore-database.bat backups\backup-aupus-YYYYMMDD-HHMM.sql
```

Isso vai:
- Verificar se o container está rodando
- Recriar o banco `aupus_local`
- Restaurar todos os dados do backup

### 4. Configurar a Aplicação para Usar o Banco Local

Copie o arquivo de ambiente local:

```bash
copy .env.local .env
```

Ou manualmente atualize a `DATABASE_URL` no `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/aupus_local?schema=public"
```

### 5. Gerar Prisma Client

```bash
npx prisma generate
```

### 6. Verificar Conexão

Execute a aplicação e verifique se conecta no banco local:

```bash
npm run dev
```

## Comandos Úteis

### Ver logs do PostgreSQL
```bash
docker logs aupus-postgres-local -f
```

### Acessar o banco via linha de comando
```bash
docker exec -it aupus-postgres-local psql -U postgres -d aupus_local
```

### Abrir Prisma Studio
```bash
npx prisma studio
```

### Parar os containers
```bash
docker-compose -f docker-compose.local.yml down
```

### Parar e APAGAR todos os dados
```bash
docker-compose -f docker-compose.local.yml down -v
```

## Estrutura de Arquivos

```
aupus-service-api/
├── docker-compose.local.yml    # Configuração Docker (PostgreSQL + Redis)
├── .env.local                   # Variáveis de ambiente para local
├── scripts/
│   ├── backup-database.bat     # Script para fazer backup
│   └── restore-database.bat    # Script para restaurar backup
└── backups/                     # Backups do banco (auto-criado)
    └── backup-aupus-*.sql
```

## Troubleshooting

### Erro: "Container não está rodando"
```bash
docker-compose -f docker-compose.local.yml up -d
```

### Erro: "Porta 5433 já em uso"
Mude a porta no `docker-compose.local.yml`:
```yaml
ports:
  - "5434:5432"  # Usa 5434 em vez de 5433
```

### Erro de conexão no backup
Verifique se:
1. Docker está rodando
2. Tem acesso ao servidor remoto (45.55.122.87)
3. Firewall não está bloqueando

### Banco local muito grande
Use backup compactado (formato custom):
```bash
# No backup-database.bat, mude -F p para -F c
# E renomeie .sql para .dump
```

## Notas

- O banco local usa a porta **5433** para não conflitar com PostgreSQL local se existir
- Redis local roda na porta **6379**
- MQTT_MODE está em `development` no `.env.local` (não salva dados MQTT)
- Os dados ficam em volumes Docker persistentes
- Backups são salvos em `backups/` (não versionados no git)
