@echo off
echo ============================================================
echo   SETUP DE PERMISSOES - AUPUS NEXON
echo ============================================================
echo.

echo [PASSO 1] Regenerando Prisma Client...
echo.
call npx prisma generate
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Falha ao gerar Prisma Client!
    echo        Certifique-se de que o backend esta PARADO.
    echo.
    pause
    exit /b 1
)

echo.
echo [OK] Prisma Client gerado com sucesso!
echo.
echo ============================================================
echo.

echo [PASSO 2] Executando seed de permissoes...
echo.
call npx ts-node prisma/seeds/seed-permissions.ts
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Falha ao executar seed!
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   SETUP CONCLUIDO COM SUCESSO!
echo ============================================================
echo.
echo Agora voce pode:
echo   1. Reiniciar o backend: npm run start:dev
echo   2. Verificar permissoes no banco de dados
echo   3. Consultar SISTEMA-PERMISSOES.md para detalhes
echo.
pause
