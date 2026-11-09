$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectDir

$ws = New-Object -ComObject WScript.Shell
$powershellExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host "       CONFIGURANDO AGENDA VIBRA - INICIALIZACAO AUTOMATICA   " -ForegroundColor Cyan
Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Criar atalho na pasta Inicializar (Startup) do Windows
$startupFolder = [Environment]::GetFolderPath('Startup')
if (Test-Path $startupFolder) {
    $startupLnk = Join-Path $startupFolder "Agenda Vibra (Servidor).lnk"
    try {
        $sc = $ws.CreateShortcut($startupLnk)
        $sc.TargetPath = $powershellExe
        $sc.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$projectDir\iniciar-servidor-silencioso.ps1`""
        $sc.WorkingDirectory = $projectDir
        $sc.Description = "Inicializacao automatica em segundo plano do servidor Agenda Vibra"
        $sc.WindowStyle = 7
        $sc.Save()
        Write-Host "[OK] Inicializacao automatica configurada com sucesso!" -ForegroundColor Green
        Write-Host "     Destino: $startupLnk" -ForegroundColor Gray
    } catch {
        Write-Host "[AVISO] Nao foi possivel gravar na pasta Inicializar: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host "[ERRO] Pasta Inicializar do Windows nao foi encontrada." -ForegroundColor Red
}

Write-Host ""

# 2. Criar atalho na Area de Trabalho (Desktop)
$desktopFolder = [Environment]::GetFolderPath('Desktop')
if (Test-Path $desktopFolder) {
    $desktopLnk = Join-Path $desktopFolder "Agenda Vibra.lnk"
    try {
        $scDesktop = $ws.CreateShortcut($desktopLnk)
        $scDesktop.TargetPath = $powershellExe
        $scDesktop.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$projectDir\abrir-agenda.ps1`""
        $scDesktop.WorkingDirectory = $projectDir
        $scDesktop.Description = "Abrir Agenda Vibra (inicia o servidor automaticamente)"
        $scDesktop.IconLocation = "$env:SystemRoot\System32\shell32.dll,220"
        $scDesktop.WindowStyle = 7
        $scDesktop.Save()
        Write-Host "[OK] Atalho na Area de Trabalho criado com sucesso!" -ForegroundColor Green
        Write-Host "     Destino: $desktopLnk" -ForegroundColor Gray
    } catch {
        Write-Host "[AVISO] Nao foi possivel gravar na Area de Trabalho: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host ""

# 3. Criar tambem um atalho dentro da propria pasta TESTE
$localLnk = Join-Path $projectDir "Agenda Vibra.lnk"
try {
    $scLocal = $ws.CreateShortcut($localLnk)
    $scLocal.TargetPath = $powershellExe
    $scLocal.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$projectDir\abrir-agenda.ps1`""
    $scLocal.WorkingDirectory = $projectDir
    $scLocal.Description = "Abrir Agenda Vibra (inicia o servidor automaticamente)"
    $scLocal.IconLocation = "$env:SystemRoot\System32\shell32.dll,220"
    $scLocal.WindowStyle = 7
    $scLocal.Save()
    Write-Host "[OK] Atalho local criado em: $localLnk" -ForegroundColor Green
} catch {}

Write-Host ""
Write-Host "==============================================================" -ForegroundColor Green
Write-Host " TUDO PRONTO!" -ForegroundColor Green
Write-Host "==============================================================" -ForegroundColor Green
Write-Host "1. O servidor iniciara AUTOMATICAMENTE ao ligar o computador."
Write-Host "2. Voce pode simplesmente abrir o icone 'Agenda Vibra' na Area de Trabalho"
Write-Host "   ou acessar no navegador: http://localhost:3000"
Write-Host "3. Se o servidor estiver fechado, o proprio atalho inicia ele na hora!"
Write-Host "==============================================================" -ForegroundColor Green
