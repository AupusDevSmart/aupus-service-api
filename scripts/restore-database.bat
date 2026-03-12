@echo off
REM Script para restaurar backup no PostgreSQL local (Docker)
REM Requer que o container aupus-postgres-local esteja rodando

echo ========================================
echo Restauracao do Banco de Dados PostgreSQL
echo ========================================
echo.

REM Verifica se foi passado o arquivo de backup como parametro
if "%1"=="" (
    echo ERRO: Informe o arquivo de backup como parametro
    echo.
    echo Uso: restore-database.bat backups\backup-aupus-2026-03-11.sql
    echo.
    echo Backups disponiveis:
    if exist "backups\*.sql" (
        dir /b backups\*.sql
    ) else (
        echo Nenhum backup encontrado na pasta backups\
    )
    echo.
    pause
    exit /b 1
)

set BACKUP_FILE=%1

if not exist "%BACKUP_FILE%" (
    echo ERRO: Arquivo de backup nao encontrado: %BACKUP_FILE%
    echo.
    pause
    exit /b 1
)

echo Verificando se o container PostgreSQL esta rodando...
docker ps | findstr "aupus-postgres-local" >nul

if %errorlevel% neq 0 (
    echo ERRO: Container PostgreSQL nao esta rodando!
    echo.
    echo Execute primeiro:
    echo   docker-compose -f docker-compose.local.yml up -d
    echo.
    pause
    exit /b 1
)

echo Container PostgreSQL esta rodando. OK!
echo.
echo Banco de dados: aupus_local
echo Container: aupus-postgres-local
echo.
echo AVISO: Isso vai APAGAR todos os dados existentes no banco local!
set /p CONFIRMA=Deseja continuar? (S/N):

if /i not "%CONFIRMA%"=="S" (
    echo Operacao cancelada.
    pause
    exit /b 0
)

echo.
echo Recriando banco de dados...
docker exec aupus-postgres-local psql -U postgres -c "DROP DATABASE IF EXISTS aupus_local;"
docker exec aupus-postgres-local psql -U postgres -c "CREATE DATABASE aupus_local;"

if %errorlevel% neq 0 (
    echo ERRO ao recriar banco de dados!
    pause
    exit /b 1
)

echo.
echo Restaurando backup...
echo Aguarde... isso pode levar alguns minutos.
echo.

REM Copia o backup para dentro do container e restaura
docker cp "%BACKUP_FILE%" aupus-postgres-local:/tmp/backup.sql
docker exec aupus-postgres-local psql -U postgres -d aupus_local -f /tmp/backup.sql

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo Restauracao concluida com sucesso!
    echo ========================================
    echo.
    echo Banco de dados: aupus_local
    echo Host: localhost:5433
    echo Usuario: postgres
    echo Senha: postgres
    echo.
    echo Atualize seu arquivo .env.local com:
    echo DATABASE_URL="postgresql://postgres:postgres@localhost:5433/aupus_local?schema=public"
    echo.
    echo Para acessar o banco via linha de comando:
    echo   docker exec -it aupus-postgres-local psql -U postgres -d aupus_local
) else (
    echo.
    echo ========================================
    echo ERRO ao restaurar backup!
    echo ========================================
)

echo.
pause
