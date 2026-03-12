param(
    [Parameter(Mandatory=$true)]
    [string]$BackupFile
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Restauracao do Banco de Dados PostgreSQL" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verifica se o arquivo de backup existe
if (-not (Test-Path $BackupFile)) {
    Write-Host "ERRO: Arquivo de backup nao encontrado: $BackupFile" -ForegroundColor Red
    Write-Host ""
    Write-Host "Backups disponiveis:" -ForegroundColor Yellow
    Get-ChildItem "backups\*.sql" -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime
    exit 1
}

# Verifica se o container está rodando
$containerRunning = docker ps --filter "name=aupus-postgres-local" --format "{{.Names}}"
if ($containerRunning -ne "aupus-postgres-local") {
    Write-Host "ERRO: Container PostgreSQL nao esta rodando!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Execute primeiro:" -ForegroundColor Yellow
    Write-Host "  docker-compose -f docker-compose.local.yml up -d" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "Container PostgreSQL esta rodando. OK!" -ForegroundColor Green
Write-Host ""
Write-Host "Banco de dados: aupus_local"
Write-Host "Container: aupus-postgres-local"
Write-Host "Arquivo: $BackupFile"
Write-Host ""
Write-Host "AVISO: Isso vai APAGAR todos os dados existentes no banco local!" -ForegroundColor Yellow
$confirma = Read-Host "Deseja continuar? (S/N)"

if ($confirma -ne "S" -and $confirma -ne "s") {
    Write-Host "Operacao cancelada."
    exit 0
}

Write-Host ""
Write-Host "Recriando banco de dados..." -ForegroundColor Yellow
docker exec aupus-postgres-local psql -U postgres -c "DROP DATABASE IF EXISTS aupus_local;" | Out-Null
docker exec aupus-postgres-local psql -U postgres -c "CREATE DATABASE aupus_local;" | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO ao recriar banco de dados!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Copiando backup para o container..." -ForegroundColor Yellow
docker cp $BackupFile aupus-postgres-local:/tmp/backup.sql

Write-Host ""
Write-Host "Restaurando backup..." -ForegroundColor Yellow
Write-Host "Aguarde... isso pode levar alguns minutos (arquivo de $((Get-Item $BackupFile).Length / 1MB) MB)." -ForegroundColor Yellow
Write-Host ""

docker exec aupus-postgres-local psql -U postgres -d aupus_local -f /tmp/backup.sql 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Restauracao concluida com sucesso!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Banco de dados: aupus_local" -ForegroundColor Green
    Write-Host "Host: localhost:5433" -ForegroundColor Green
    Write-Host "Usuario: postgres" -ForegroundColor Green
    Write-Host "Senha: postgres" -ForegroundColor Green
    Write-Host ""
    Write-Host "DATABASE_URL para .env:" -ForegroundColor Cyan
    Write-Host 'DATABASE_URL="postgresql://postgres:postgres@localhost:5433/aupus_local?schema=public"' -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "ERRO ao restaurar backup!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
}
