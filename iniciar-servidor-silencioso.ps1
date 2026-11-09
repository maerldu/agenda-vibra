$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectDir

# 1. Localizar node.exe
$nodeBin = "node"
if (Test-Path "C:\Program Files\nodejs\node.exe") {
    $nodeBin = "C:\Program Files\nodejs\node.exe"
} elseif (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    exit 1
}

# 2. Testar se o servidor ja esta rodando na porta 3000
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

# 3. Se nao estiver rodando, inicia o servidor em segundo plano (oculto)
if (-not $isRunning) {
    $serverJs = Join-Path $projectDir "server.js"
    Start-Process -FilePath $nodeBin -ArgumentList "`"$serverJs`"" -WorkingDirectory $projectDir -WindowStyle Hidden
}
