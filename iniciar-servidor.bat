@echo off
chcp 65001 >nul
title Agenda Vibra - Servidor Local

cd /d "%~dp0"

echo ==============================================================
echo        INICIANDO SERVIDOR LOCAL - AGENDA VIBRA
echo ==============================================================
echo.

set NODE_BIN=node
where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set NODE_BIN="C:\Program Files\nodejs\node.exe"
    ) else (
        echo [ERRO] O Node.js nao foi encontrado no sistema!
        echo Por favor, instale o Node.js ou adicione-o ao PATH.
        pause
        exit /b 1
    )
)

echo Iniciando navegador em http://localhost:3000 ...
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

:loop
%NODE_BIN% server.js
echo.
echo Servidor parado. Reiniciando em 2 segundos (feche esta janela para encerrar)...
timeout /t 2 /nobreak >nul
goto loop
