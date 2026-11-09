@echo off
chcp 65001 >nul
title Parar Servidor - Agenda Vibra
cd /d "%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -ExecutionPolicy Bypass -File "%~dp0parar-servidor.ps1"
echo.
echo Pressione qualquer tecla para sair...
pause >nul
