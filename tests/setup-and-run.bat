@echo off
REM Script para Windows - Configurar e executar os testes do Aupus Nexon

echo ================================================================================
echo            AUPUS NEXON - SETUP E EXECUCAO DE TESTES
echo ================================================================================
echo.

REM Verificar se está no diretório correto
if not exist "package.json" (
    echo [ERRO] Execute este script de dentro do diretório tests/
    exit /b 1
)

REM 1. Verificar Node.js
echo [1/7] Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js nao encontrado. Instale Node.js primeiro.
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo [OK] Node.js %NODE_VERSION% encontrado
echo.

REM 2. Verificar npm
echo [2/7] Verificando npm...
npm --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] npm nao encontrado.
    exit /b 1
)
for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo [OK] npm %NPM_VERSION% encontrado
echo.

REM 3. Instalar dependências
echo [3/7] Instalando dependencias...
call npm install
if errorlevel 1 (
    echo [ERRO] Falha ao instalar dependencias
    exit /b 1
)
echo [OK] Dependencias instaladas com sucesso
echo.

REM 4. Verificar arquivo .env
echo [4/7] Verificando arquivo .env...
if not exist ".env" (
    echo [AVISO] Arquivo .env nao encontrado. Criando a partir do .env.example...
    copy .env.example .env >nul
    echo [AVISO] Por favor, edite o arquivo .env com suas configuracoes.
    echo.
    pause
)
echo [OK] Arquivo .env encontrado
echo.

REM 5. Verificar se a API está rodando
echo [5/7] Verificando se a API esta acessivel...
REM Ler API_BASE_URL do .env (simplificado para Windows)
set API_BASE_URL=http://localhost:3000
for /f "tokens=1,2 delims==" %%a in (.env) do (
    if "%%a"=="API_BASE_URL" set API_BASE_URL=%%b
)

curl -s --connect-timeout 5 "%API_BASE_URL%" >nul 2>&1
if errorlevel 1 (
    echo [AVISO] API nao esta respondendo em %API_BASE_URL%
    echo [AVISO] Certifique-se de que a API esta rodando antes de executar os testes.
    echo.
    set /p CONTINUE="Deseja continuar mesmo assim? (S/N): "
    if /i not "%CONTINUE%"=="S" (
        echo Abortado pelo usuario.
        exit /b 1
    )
) else (
    echo [OK] API esta acessivel em %API_BASE_URL%
)
echo.

REM 6. Criar diretório de relatórios
echo [6/7] Criando diretorio de relatorios...
if not exist "reports" mkdir reports
echo [OK] Diretorio de relatorios criado
echo.

REM 7. Executar testes
echo ================================================================================
echo                          EXECUTANDO TESTES
echo ================================================================================
echo.

call npm test

set EXIT_CODE=%ERRORLEVEL%

echo.
echo ================================================================================
echo                          TESTES CONCLUIDOS
echo ================================================================================
echo.

if %EXIT_CODE%==0 (
    echo [OK] Todos os testes passaram!
) else (
    echo [ERRO] Alguns testes falharam. Verifique o relatorio acima.
    echo.
    echo Para mais detalhes, consulte:
    echo    - Relatorio JSON: tests\reports\test-report-*.json
    echo    - Plano de Correcao: tests\PLANO-DE-CORRECAO.md
)

echo.
pause
exit /b %EXIT_CODE%
