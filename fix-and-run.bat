@echo off
echo =====================================
echo  GERANDO PRISMA CLIENT E RODANDO APP
echo =====================================
echo.

echo [1/2] Gerando Prisma Client...
call npx prisma generate

echo.
echo [2/2] Iniciando servidor...
call npm run start:dev
