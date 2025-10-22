# Script para forçar a liberação do arquivo e executar prisma generate
# Execute este script como ADMINISTRADOR

Write-Host "===== FIX PRISMA GENERATE =====" -ForegroundColor Cyan
Write-Host ""

# Adicionar exclusão no Windows Defender
Write-Host "1. Adicionando exclusão no Windows Defender..." -ForegroundColor Yellow
try {
    Add-MpPreference -ExclusionPath "C:\Users\Public\aupus-service\aupus-service-api\node_modules\.prisma" -ErrorAction SilentlyContinue
    Write-Host "   Exclusão adicionada!" -ForegroundColor Green
} catch {
    Write-Host "   Aviso: Não foi possível adicionar exclusão" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "2. Finalizando todos os processos Node.js..." -ForegroundColor Yellow

# Finalizar todos os processos node.exe
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "   Processos Node.js finalizados!" -ForegroundColor Green

Write-Host ""
Write-Host "3. Tentando remover arquivos travados..." -ForegroundColor Yellow

# Tentar deletar arquivos .dll.node e temporários específicos
$prismaPath = "C:\Users\Public\aupus-service\aupus-service-api\node_modules\.prisma\client"
if (Test-Path $prismaPath) {
    # Deletar arquivos .dll.node
    Get-ChildItem -Path $prismaPath -Filter "*.dll.node" -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            Remove-Item $_.FullName -Force -ErrorAction Stop
            Write-Host "   Removido: $($_.Name)" -ForegroundColor Green
        } catch {
            Write-Host "   Ainda travado: $($_.Name)" -ForegroundColor Red
        }
    }

    # Deletar arquivos temporários
    Get-ChildItem -Path $prismaPath -Filter "*.tmp*" -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "4. Aguardando 3 segundos para liberar handles..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "5. Removendo pasta .prisma completamente..." -ForegroundColor Yellow
if (Test-Path "C:\Users\Public\aupus-service\aupus-service-api\node_modules\.prisma") {
    Remove-Item -Path "C:\Users\Public\aupus-service\aupus-service-api\node_modules\.prisma" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   Pasta removida!" -ForegroundColor Green
}

Write-Host ""
Write-Host "6. Executando prisma generate..." -ForegroundColor Yellow
Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Gray

Set-Location "C:\Users\Public\aupus-service\aupus-service-api"
npx prisma generate

Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""
Write-Host "===== CONCLUÍDO =====" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pressione qualquer tecla para sair..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
