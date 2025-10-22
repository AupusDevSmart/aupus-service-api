# Script para adicionar exclusão no Windows Defender e executar prisma generate
# Execute este script como ADMINISTRADOR

Write-Host "Adicionando exclusão no Windows Defender..." -ForegroundColor Yellow

# Adicionar exclusão para a pasta .prisma
Add-MpPreference -ExclusionPath "C:\Users\Public\aupus-service\aupus-service-api\node_modules\.prisma"

Write-Host "Exclusão adicionada com sucesso!" -ForegroundColor Green
Write-Host ""
Write-Host "Limpando pasta .prisma..." -ForegroundColor Yellow

# Limpar pasta .prisma
if (Test-Path "C:\Users\Public\aupus-service\aupus-service-api\node_modules\.prisma") {
    Remove-Item -Path "C:\Users\Public\aupus-service\aupus-service-api\node_modules\.prisma" -Recurse -Force
    Write-Host "Pasta .prisma removida!" -ForegroundColor Green
}

Write-Host ""
Write-Host "Executando prisma generate..." -ForegroundColor Yellow
Write-Host ""

# Navegar para a pasta e executar prisma generate
Set-Location "C:\Users\Public\aupus-service\aupus-service-api"
npx prisma generate

Write-Host ""
Write-Host "Concluído!" -ForegroundColor Green
Write-Host ""
Write-Host "Pressione qualquer tecla para sair..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
