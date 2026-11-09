@echo off
chcp 65001 >nul
title Agenda Vibra
cd /d "%~dp0"
start "" /min "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0abrir-agenda.ps1"
exit
