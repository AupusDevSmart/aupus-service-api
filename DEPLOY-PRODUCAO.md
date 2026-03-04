# Deploy de Produção - aupus-service-api (Backend)

## Arquivos que precisam ser configurados para produção

### 1. `src/main.ts` - Configuração CORS

Após o `git pull`, o CORS pode ser sobrescrito com lista restrita de domínios.

**Configuração de PRODUÇÃO (permite todas as origens):**
```typescript
app.enableCors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-xsrf-token'],
  credentials: true,
});
```

**Configuração RESTRITA (pode causar erros CORS):**
```typescript
app.enableCors({
  origin: [
    'http://localhost:5175',
    'http://localhost:5173',
    // ... lista de domínios
  ],
  // ...
});
```

> **Nota:** Se preferir manter lista restrita, adicione todos os domínios necessários:
> - `https://nexon.aupusenergia.com.br`
> - `https://aupus-service.aupusenergia.com.br`
> - `https://aupus-service-api.aupusenergia.com.br`
> - `http://localhost:5173` (desenvolvimento)
> - `http://localhost:5175` (desenvolvimento)

---

### 2. `.env` - Variáveis de Ambiente

O arquivo `.env` geralmente NÃO é versionado no Git, então não deve ser sobrescrito.
Mas caso precise recriar, as variáveis importantes são:

```env
# Database
DATABASE_URL="postgresql://..."

# JWT
JWT_SECRET="..."
JWT_REFRESH_SECRET="..."

# MQTT
MQTT_HOST="72.60.158.163"
MQTT_PORT=1883

# Porta da API
PORT=3000

# Ambiente
NODE_ENV=production
MQTT_MODE=production
```

---

### 3. `prisma/schema.prisma` - Schema do Banco

Após alterações no schema, rodar:
```bash
npx prisma generate
```

---

## Comandos de Deploy

```bash
# 1. Entrar no diretório
cd /var/www/aupus-service-api

# 2. Salvar alterações locais (se houver)
git stash

# 3. Puxar código do GitHub
git pull origin main

# 4. Verificar/corrigir CORS em src/main.ts (se necessário)
# Garantir que origin: true ou lista inclui todos os domínios

# 5. Regenerar Prisma Client (se schema mudou)
npx prisma generate

# 6. Build
npm run build

# 7. Reiniciar a API
pm2 restart aupus-service-api

# 8. Verificar logs
pm2 logs aupus-service-api --lines 20 --nostream
```

---

## Checklist Pós-Deploy

- [ ] CORS configurado corretamente em `src/main.ts`
- [ ] Prisma client regenerado (se schema mudou)
- [ ] Build concluído sem erros
- [ ] API reiniciada via PM2
- [ ] Logs mostram "Nest application successfully started"
- [ ] MQTT conectado (logs mostram "✅ [MQTT] Conectado com sucesso!")

---

## Comandos Úteis PM2

```bash
# Ver status
pm2 list

# Ver logs em tempo real
pm2 logs aupus-service-api

# Ver logs (últimas N linhas)
pm2 logs aupus-service-api --lines 50 --nostream

# Reiniciar
pm2 restart aupus-service-api

# Parar
pm2 stop aupus-service-api

# Ver métricas
pm2 monit
```

---

## Problemas Comuns

### Erro CORS: "blocked by CORS policy"

**Causa:** Domínio do frontend não está na lista de origins permitidos.

**Solução:**
1. Editar `src/main.ts`
2. Adicionar domínio à lista ou usar `origin: true`
3. `npm run build && pm2 restart aupus-service-api`

### Erro Prisma: "Property 'xxx' does not exist on type 'PrismaService'"

**Causa:** Prisma client desatualizado após mudança no schema.

**Solução:** `npx prisma generate`

### API não inicia / PM2 mostra "errored"

**Causa:** Erro de build ou configuração.

**Solução:**
1. `pm2 logs aupus-service-api --lines 100 --nostream`
2. Identificar erro nos logs
3. Corrigir e rebuildar
