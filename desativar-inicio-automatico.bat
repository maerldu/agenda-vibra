@echo off
chcp 65001 >nul
title Desativar Inicio Automatico - Agenda Vibra
cd /d "%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -ExecutionPolicy Bypass -File "%~dp0desativar-inicio-automatico.ps1"
echo.
echo Pressione qualquer tecla para sair...
pause >nul
