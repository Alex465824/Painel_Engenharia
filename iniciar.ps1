# Sobe o Painel de Engenharia. Cria o ambiente e instala as dependencias na primeira execucao.
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$venv = Join-Path $PSScriptRoot "backend\.venv"
$python = Join-Path $venv "Scripts\python.exe"
# PORT e a convencao usada por hospedagens Node (ex.: ao rodar via npm start); PORTA e a nossa, de antes.
$porta = if ($env:PORT) { $env:PORT } elseif ($env:PORTA) { $env:PORTA } else { "8090" }

if (-not (Test-Path $python)) {
    Write-Host "Criando o ambiente virtual..." -ForegroundColor Cyan
    python -m venv $venv
    & $python -m pip install --upgrade pip --quiet
}

$marcador = Join-Path $venv ".deps-instaladas"
if (-not (Test-Path $marcador)) {
    Write-Host "Instalando dependencias..." -ForegroundColor Cyan
    & $python -m pip install -r backend\requirements.txt --quiet
    New-Item -ItemType File $marcador | Out-Null
}

if (-not (Test-Path "backend\.env")) {
    Copy-Item "backend\.env.example" "backend\.env"
    Write-Host "Criei backend\.env a partir do exemplo. Preencha as credenciais do Prevision e do Mega antes de usar." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Painel de Engenharia rodando em http://localhost:$porta" -ForegroundColor Green
try {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
           Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
           Select-Object -First 1).IPAddress
    if ($ip) { Write-Host "  Na rede interna:  http://${ip}:$porta" }
} catch { }
Write-Host "  Ctrl+C encerra."
Write-Host ""

Set-Location backend
& $python -m uvicorn app.main:app --host 0.0.0.0 --port $porta
