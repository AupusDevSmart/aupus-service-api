#!/bin/bash
set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para printar com cores
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Banner
echo "=================================================="
echo "🚀 Deploy - Aupus Service API"
echo "=================================================="
echo ""

# Verificar se está no diretório correto
if [ ! -f "package.json" ]; then
    print_error "Erro: package.json não encontrado!"
    print_info "Execute este script da pasta raiz do projeto."
    exit 1
fi

# Verificar se docker está instalado
if ! command -v docker &> /dev/null; then
    print_error "Docker não encontrado! Instale o Docker primeiro."
    exit 1
fi

# Verificar se docker-compose está instalado
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose não encontrado! Instale o Docker Compose primeiro."
    exit 1
fi

# Verificar se o arquivo de produção existe
if [ ! -f "docker-compose.production.yml" ]; then
    print_error "Arquivo docker-compose.production.yml não encontrado!"
    exit 1
fi

# Verificar se o .env.production existe
if [ ! -f ".env.production" ]; then
    print_warning ".env.production não encontrado!"
    print_info "Criando template de .env.production..."
    cp .env.example .env.production
    print_warning "IMPORTANTE: Edite o arquivo .env.production antes de continuar!"
    print_info "Configure especialmente: SENTRY_DSN, JWT_SECRET, DATABASE_URL"
    echo ""
    read -p "Pressione Enter depois de configurar o .env.production..."
fi

# Confirmar deploy
echo ""
print_warning "Você está prestes a fazer deploy em PRODUÇÃO!"
print_info "Isso irá:"
echo "  - Parar o container atual"
echo "  - Fazer rebuild da imagem"
echo "  - Iniciar novo container"
echo ""
read -p "Deseja continuar? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_info "Deploy cancelado."
    exit 0
fi

# Carregar variáveis de ambiente
if [ -f ".env.production" ]; then
    print_info "Carregando variáveis de ambiente..."
    export $(cat .env.production | grep -v '^#' | xargs)
fi

# Verificar variáveis críticas
print_info "Verificando configurações críticas..."

MISSING_VARS=()

if [ -z "$SENTRY_DSN" ]; then
    MISSING_VARS+=("SENTRY_DSN")
fi

if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" == "change-this-in-production-very-secure-key-here" ]; then
    MISSING_VARS+=("JWT_SECRET")
fi

if [ -z "$DATABASE_URL" ]; then
    MISSING_VARS+=("DATABASE_URL")
fi

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    print_error "Variáveis críticas não configuradas:"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
    print_info "Configure estas variáveis no .env.production"
    exit 1
fi

print_success "Configurações verificadas!"

# Criar backup do banco (opcional)
echo ""
read -p "Deseja fazer backup do banco antes do deploy? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Fazendo backup do banco de dados..."
    BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"

    if [ -f "src/scripts/backup-database.ts" ]; then
        npm run backup 2>/dev/null || print_warning "Backup falhou, continuando..."
    else
        print_warning "Script de backup não encontrado, pulando..."
    fi
fi

# Parar containers antigos
echo ""
print_info "Parando containers antigos..."
docker-compose -f docker-compose.production.yml down || true
print_success "Containers parados!"

# Build e start
echo ""
print_info "Fazendo build da aplicação..."
docker-compose -f docker-compose.production.yml build --no-cache

print_info "Iniciando containers..."
docker-compose -f docker-compose.production.yml up -d

# Aguardar aplicação iniciar
print_info "Aguardando aplicação iniciar..."
sleep 15

# Verificar se o container está rodando
if [ "$(docker ps -q -f name=aupus-api-production)" ]; then
    print_success "Container está rodando!"
else
    print_error "Container não está rodando!"
    print_info "Verificando logs..."
    docker-compose -f docker-compose.production.yml logs --tail=50 app
    exit 1
fi

# Health check
echo ""
print_info "Verificando health da aplicação..."

MAX_RETRIES=5
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f -s http://localhost/api/v1/health > /dev/null 2>&1; then
        print_success "Health check passou!"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        print_warning "Health check falhou (tentativa $RETRY_COUNT/$MAX_RETRIES)..."
        sleep 5
    fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    print_error "Health check falhou após $MAX_RETRIES tentativas!"
    print_info "Verificando logs..."
    docker-compose -f docker-compose.production.yml logs --tail=50 app
    exit 1
fi

# Verificar Sentry
echo ""
print_info "Verificando integração com Sentry..."
docker-compose -f docker-compose.production.yml logs app | grep -i "sentry" | tail -n 3

# Mostrar informações finais
echo ""
echo "=================================================="
print_success "Deploy concluído com sucesso!"
echo "=================================================="
echo ""
print_info "Informações úteis:"
echo ""
echo "📊 Ver logs:"
echo "   docker-compose -f docker-compose.production.yml logs -f app"
echo "   ou: npm run docker:production:logs"
echo ""
echo "🏥 Health check:"
echo "   curl http://localhost/api/v1/health"
echo ""
echo "📈 Métricas do banco:"
echo "   curl http://localhost/api/v1/health/metrics/database"
echo ""
echo "📖 Swagger docs:"
echo "   http://localhost/api/docs"
echo ""
echo "🔍 Sentry dashboard:"
echo "   https://sentry.io/"
echo ""
echo "🐳 Status do container:"
echo "   docker ps"
echo ""
echo "🔄 Reiniciar:"
echo "   docker-compose -f docker-compose.production.yml restart app"
echo ""
echo "🛑 Parar:"
echo "   docker-compose -f docker-compose.production.yml down"
echo ""
echo "=================================================="

# Mostrar logs finais
echo ""
read -p "Deseja ver os logs em tempo real? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Mostrando logs (Ctrl+C para sair)..."
    docker-compose -f docker-compose.production.yml logs -f app
fi
