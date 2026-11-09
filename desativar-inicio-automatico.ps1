$startupFolder = [Environment]::GetFolderPath('Startup')
$startupLnk = Join-Path $startupFolder "Agenda Vibra (Servidor).lnk"

if (Test-Path $startupLnk) {
    Remove-Item $startupLnk -Force -ErrorAction SilentlyContinue
    Write-Host "[OK] Inicializacao automatica removida com sucesso!" -ForegroundColor Green
    Write-Host "O servidor nao sera mais iniciado junto com o Windows."
} else {
    Write-Host "[INFO] A inicializacao automatica ja estava desativada." -ForegroundColor Yellow
}
