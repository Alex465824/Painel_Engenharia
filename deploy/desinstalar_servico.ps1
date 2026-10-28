# Para e remove o Servico do Windows do Painel de Engenharia. Rode como Administrador.

$ErrorActionPreference = "Stop"
$raiz = Split-Path $PSScriptRoot -Parent
Set-Location $raiz

$python = Join-Path $raiz "backend\.venv\Scripts\python.exe"
$servico = Join-Path $raiz "backend\servico_windows.py"

if (-not (Test-Path $python)) {
    throw "Ambiente virtual nao encontrado em backend\.venv - o servico provavelmente nao esta instalado por aqui."
}

Write-Host "Parando o servico..." -ForegroundColor Cyan
& $python $servico stop

Write-Host "Removendo o servico..." -ForegroundColor Cyan
& $python $servico remove

Write-Host "Servico removido." -ForegroundColor Green
