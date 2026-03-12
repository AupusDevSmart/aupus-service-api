@echo off
REM Script para fazer backup do banco PostgreSQL remoto usando Docker
REM Nao requer PostgreSQL instalado localmente - usa container Docker

echo ========================================
echo Backup do Banco de Dados PostgreSQL
echo ========================================
echo.

REM Cria diretorio de backups se nao existir
if not exist "backups" mkdir backups

REM Nome do arquivo de backup com data/hora
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c%%a%%b)
for /f "tokens=1-2 delims=/: " %%a in ('time /t') do (set mytime=%%a%%b)
set BACKUP_FILE=backups\backup-aupus-%mydate%-%mytime%.sql

echo Conectando ao servidor remoto: 45.55.122.87:5432
echo Banco de dados: aupus
echo Usuario: admin
echo.
echo Criando backup em: %BACKUP_FILE%
echo.
echo Aguarde... isso pode levar alguns minutos dependendo do tamanho do banco.
echo.

REM Executa pg_dump via Docker (nao precisa ter PostgreSQL instalado)
docker run --rm ^
  -e PGPASSWORD=password ^
  postgres:15 ^
  pg_dump -h 45.55.122.87 -p 5432 -U admin -d aupus -F p > %BACKUP_FILE%

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo Backup concluido com sucesso!
    echo ========================================
    echo Arquivo: %BACKUP_FILE%
    dir %BACKUP_FILE%
    echo.
    echo Para restaurar, primeiro suba o banco local:
    echo   docker-compose -f docker-compose.local.yml up -d
    echo.
    echo Depois execute:
    echo   .\scripts\restore-database.bat %BACKUP_FILE%
) else (
    echo.
    echo ========================================
    echo ERRO ao criar backup!
    echo ========================================
    echo Verifique se:
    echo 1. O Docker esta instalado e rodando
    echo 2. Ha conectividade com o servidor remoto
)

echo.
pause
