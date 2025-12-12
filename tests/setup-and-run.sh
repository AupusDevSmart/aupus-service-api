#!/bin/bash

# Script para configurar e executar os testes do Aupus Nexon

echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║           AUPUS NEXON - SETUP E EXECUÇÃO DE TESTES                        ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se está no diretório correto
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Erro: Execute este script de dentro do diretório tests/${NC}"
    exit 1
fi

# 1. Verificar Node.js
echo "🔍 Verificando Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js não encontrado. Instale Node.js primeiro.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node --version) encontrado${NC}"
echo ""

# 2. Verificar npm
echo "🔍 Verificando npm..."
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm não encontrado.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ npm $(npm --version) encontrado${NC}"
echo ""

# 3. Instalar dependências
echo "📦 Instalando dependências..."
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Falha ao instalar dependências${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Dependências instaladas com sucesso${NC}"
echo ""

# 4. Verificar arquivo .env
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  Arquivo .env não encontrado. Criando a partir do .env.example...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Por favor, edite o arquivo .env com suas configurações antes de continuar.${NC}"
    echo ""
    read -p "Pressione ENTER quando tiver configurado o .env..."
fi

# 5. Verificar se a API está rodando
echo "🔍 Verificando se a API está acessível..."
source .env 2>/dev/null || true
API_URL=${API_BASE_URL:-http://localhost:3000}

if curl -s --connect-timeout 5 "$API_URL" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ API está acessível em $API_URL${NC}"
else
    echo -e "${YELLOW}⚠️  API não está respondendo em $API_URL${NC}"
    echo -e "${YELLOW}   Certifique-se de que a API está rodando antes de executar os testes.${NC}"
    echo ""
    read -p "Deseja continuar mesmo assim? (s/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Ss]$ ]]; then
        echo "Abortado pelo usuário."
        exit 1
    fi
fi
echo ""

# 6. Criar diretório de relatórios
mkdir -p reports
echo -e "${GREEN}✅ Diretório de relatórios criado${NC}"
echo ""

# 7. Executar testes
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║                          EXECUTANDO TESTES                                 ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

npm test

EXIT_CODE=$?

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║                          TESTES CONCLUÍDOS                                 ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ Todos os testes passaram!${NC}"
else
    echo -e "${RED}❌ Alguns testes falharam. Verifique o relatório acima.${NC}"
    echo ""
    echo "📋 Para mais detalhes, consulte:"
    echo "   - Relatório JSON: tests/reports/test-report-*.json"
    echo "   - Plano de Correção: tests/PLANO-DE-CORRECAO.md"
fi

echo ""
exit $EXIT_CODE
