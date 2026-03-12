$date = Get-Date -Format 'yyyyMMdd-HHmm'
$backupFile = "backups\backup-aupus-$date.sql"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backup do Banco de Dados PostgreSQL" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Conectando ao servidor remoto: 45.55.122.87:5432"
Write-Host "Banco de dados: aupus"
Write-Host "Usuario: admin"
Write-Host ""
Write-Host "Criando backup em: $backupFile"
Write-Host ""
Write-Host "Aguarde... isso pode levar alguns minutos." -ForegroundColor Yellow
Write-Host ""

# Executa o backup via Docker
docker run --rm -e PGPASSWORD=password postgres:15 pg_dump -h 45.55.122.87 -p 5432 -U admin -d aupus -F p | Out-File -FilePath $backupFile -Encoding UTF8

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Backup concluido com sucesso!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Arquivo: $backupFile"
    Get-Item $backupFile | Select-Object Name, Length, LastWriteTime
    Write-Host ""
    Write-Host "Tamanho: $((Get-Item $backupFile).Length / 1MB) MB" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "ERRO ao criar backup!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
}
