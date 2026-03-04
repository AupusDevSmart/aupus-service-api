# Deploy - aupus-service-api

## Configuracoes Locais Importantes

Estes arquivos tem configuracoes especificas do ambiente de producao e NAO devem ser sobrescritos pelo git:

### src/main.ts
- **CORS Origins**: Lista de dominios permitidos para fazer requisicoes
  - Adicionar novos dominios de frontend na lista `origin` do `app.enableCors()`
  - Dominios atuais:
    - `http://localhost:5175` (dev)
    - `http://localhost:5173` (dev)
    - `http://localhost:5174` (dev)
    - `http://localhost:3000` (dev)
    - `https://aupus-service.aupusenergia.com.br`
    - `https://aupus-service-api.aupusenergia.com.br`
    - `https://nexon.aupusenergia.com.br`

### ecosystem.config.js
- Configuracoes do PM2 para producao

### .env
- Variaveis de ambiente (banco de dados, MQTT, etc)

---

## Comandos de Deploy

### 1. Atualizar codigo do GitHub
```bash
cd /var/www/aupus-service-api
git pull origin main
```

### 2. Instalar dependencias (se necessario)
```bash
npm install
```

### 3. Build
```bash
npm run build
```

### 4. Reiniciar servico
```bash
pm2 restart aupus-service-api
```

### 5. Verificar logs
```bash
pm2 logs aupus-service-api --lines 50 --nostream
```

---

## Deploy Completo (one-liner)
```bash
cd /var/www/aupus-service-api && git pull origin main && npm install && npm run build && pm2 restart aupus-service-api
```

---

## Troubleshooting

### Erro de CORS
Se aparecer erro de CORS no frontend, adicionar o dominio em `src/main.ts` na lista de `origin` do `enableCors()`.

### Branches divergentes
Se o git pull falhar com "divergent branches":
```bash
# CUIDADO: Isso descarta mudancas locais
git fetch origin
git reset --hard origin/main
```

### Verificar status do servico
```bash
pm2 list
pm2 logs aupus-service-api
```

---

## Historico de Mudancas de Deploy

### 2024-12-23
- Adicionado dominio `https://nexon.aupusenergia.com.br` ao CORS
- Criado este arquivo de documentacao
