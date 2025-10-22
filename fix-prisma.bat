@echo off
echo Parando processos Node.js...
taskkill /F /IM node.exe 2>nul

echo Limpando arquivos do Prisma...
rmdir /s /q node_modules\.prisma 2>nul

echo Aguardando 2 segundos...
timeout /t 2 /nobreak >nul

echo Executando prisma generate...
call npx prisma generate

echo.
echo Concluido!
pause
