#!/bin/bash
# Quick deploy - apenas pull, build e restart (sem npm install)

set -e
cd /var/www/aupus-service-api

echo "🚀 Quick Deploy - Aupus Service API"
echo ""

# Backup .env
cp .env .env.backup 2>/dev/null || true

# Git pull
echo "📥 Atualizando código..."
git pull

# Restaurar .env
cp .env.backup .env 2>/dev/null || true

# Build
echo "🔨 Compilando..."
npm run build

# Restart PM2
echo "🔄 Reiniciando..."
pm2 reload aupus-service-api --update-env

echo "✅ Deploy rápido concluído!"
pm2 logs aupus-service-api --lines 10 --nostream
