$stopped = $false

# Metodo 1: Buscar processos node que rodam server.js
try {
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
    foreach ($p in $processes) {
        if ($p.CommandLine -like "*server.js*") {
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
            Write-Host "[OK] Processo do servidor (PID $($p.ProcessId)) encerrado." -ForegroundColor Green
            $stopped = $true
        }
    }
} catch {}

# Metodo 2: Se ainda houver processo na porta 3000, encerrar
try {
    $conns = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
    if ($conns) {
        foreach ($conn in $conns) {
            $pidToKill = $conn.OwningProcess
            if ($pidToKill -gt 0) {
                Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
                Write-Host "[OK] Processo na porta 3000 (PID $pidToKill) encerrado." -ForegroundColor Green
                $stopped = $true
            }
        }
    }
} catch {}

if (-not $stopped) {
    Write-Host "[INFO] Nenhum servidor Agenda Vibra ativo foi encontrado." -ForegroundColor Yellow
}
