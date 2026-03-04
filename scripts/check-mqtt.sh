#!/bin/bash
# Script para verificar conexão MQTT

echo "🔍 Verificando configuração MQTT..."
echo ""

# Ler variáveis do .env
source /var/www/aupus-service-api/.env

echo "📋 Configuração:"
echo "  Host: $MQTT_HOST"
echo "  Port: $MQTT_PORT"
echo "  User: $MQTT_USERNAME"
echo ""

# Verificar se pode conectar no host
echo "🌐 Testando conectividade..."
if timeout 5 bash -c "cat < /dev/null > /dev/tcp/$MQTT_HOST/$MQTT_PORT" 2>/dev/null; then
    echo "✅ Porta $MQTT_PORT está acessível em $MQTT_HOST"
else
    echo "❌ Não foi possível conectar em $MQTT_HOST:$MQTT_PORT"
    exit 1
fi

echo ""
echo "📊 Logs de conexão MQTT na aplicação:"
pm2 logs aupus-service-api --nostream --lines 50 | grep -i mqtt || echo "Nenhum log MQTT encontrado"

echo ""
echo "💡 Dica: Use 'pm2 logs aupus-service-api | grep MQTT' para monitorar em tempo real"
