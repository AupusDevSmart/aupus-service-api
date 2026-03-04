#!/bin/bash

# ===========================================
# Deploy Script - aupus-service-api (Backend)
# ===========================================

set -e

echo "🚀 Iniciando deploy do aupus-service-api..."

cd /var/www/aupus-service-api

# 1. Salvar alterações locais
echo "📦 Salvando alterações locais..."
git stash || true

# 2. Puxar código do GitHub
echo "⬇️  Puxando código do GitHub..."
git pull origin main

# 3. Corrigir CORS para permitir todas as origens
echo "🔧 Configurando CORS para produção..."

# Substituir configuração de CORS restrita por permissiva
# Isso usa um padrão mais complexo para lidar com múltiplas linhas
sed -i '/enableCors({/,/});/{
  s/origin: \[/origin: true, \/\/ PRODUCTION: permite todas as origens\n    \/\/ origin: [/
  s/\],$/],/
}' src/main.ts 2>/dev/null || true

# Método alternativo mais simples - substitui a linha do origin
sed -i "s|origin: \[|origin: true, // PERMITIR TODAS ORIGENS\n    // origin_disabled: [|g" src/main.ts 2>/dev/null || true

# 4. Regenerar Prisma Client
echo "🔧 Regenerando Prisma Client..."
npx prisma generate

# 5. Build
echo "🔨 Executando build..."
npm run build

# 6. Reiniciar API
echo "🔄 Reiniciando API via PM2..."
pm2 restart aupus-service-api

# 7. Aguardar inicialização
echo "⏳ Aguardando inicialização..."
sleep 5

# 8. Verificar status
echo "📊 Status da API:"
pm2 list | grep aupus-service-api

echo ""
echo "✅ Deploy do aupus-service-api concluído!"
echo ""
echo "🔍 Verificar logs com: pm2 logs aupus-service-api --lines 30 --nostream"
