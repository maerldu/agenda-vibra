Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host "           STATUS DO SERVIDOR - AGENDA VIBRA                  " -ForegroundColor Cyan
Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host ""

$isRunning = $false
try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect("127.0.0.1", 3000, $null, $null)
    $wait = $iar.AsyncWaitHandle.WaitOne(400, $false)
    if ($wait -and $client.Connected) {
        $isRunning = $true
        $client.EndConnect($iar)
    }
    $client.Close()
} catch {
    $isRunning = $false
}

if ($isRunning) {
    Write-Host "[STATUS] ATIVO E RESPONDENDO NA PORTA 3000" -ForegroundColor Green
    Write-Host "-> Acesso Local:   http://localhost:3000"
    Write-Host ""
    
    try {
        $conns = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
        if ($conns) {
            $p = Get-Process -Id $conns[0].OwningProcess -ErrorAction SilentlyContinue
            if ($p) {
                Write-Host "-> Processo ID (PID): $($p.Id)"
                Write-Host "-> Memoria usada:     $([math]::Round($p.WorkingSet64 / 1MB, 2)) MB"
            }
        }
    } catch {}
} else {
    Write-Host "[STATUS] PARADO (Nenhum servidor ativo na porta 3000)" -ForegroundColor Red
    Write-Host "-> Para iniciar, execute 'abrir-agenda.bat' ou use o atalho 'Agenda Vibra' na Area de Trabalho."
}

$startupFolder = [Environment]::GetFolderPath('Startup')
$startupLnk = Join-Path $startupFolder "Agenda Vibra (Servidor).lnk"
Write-Host ""
if (Test-Path $startupLnk) {
    Write-Host "[INICIALIZACAO AUTOMATICA] ATIVADA (Inicia junto com o Windows)" -ForegroundColor Green
} else {
    Write-Host "[INICIALIZACAO AUTOMATICA] DESATIVADA" -ForegroundColor Yellow
}
Write-Host "==============================================================" -ForegroundColor Cyan
