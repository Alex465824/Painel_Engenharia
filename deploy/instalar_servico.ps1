# Instala o Painel de Engenharia como Servico do Windows (inicia sozinho com o servidor,
# reinicia sozinho se cair). Rode como Administrador.
#
# Pre-requisito: ja ter rodado .\iniciar.ps1 pelo menos uma vez nesta maquina (cria o
# ambiente virtual em backend\.venv) e ja ter preenchido backend\.env com as credenciais
# REAIS de producao (copie backend\.env.example se ainda nao existir).

$ErrorActionPreference = "Stop"
$raiz = Split-Path $PSScriptRoot -Parent
Set-Location $raiz

$python = Join-Path $raiz "backend\.venv\Scripts\python.exe"
$servico = Join-Path $raiz "backend\servico_windows.py"

if (-not (Test-Path $python)) {
    throw "Ambiente virtual nao encontrado em backend\.venv. Rode .\iniciar.ps1 ao menos uma vez antes (ele cria o venv e instala as dependencias), depois rode este script de novo."
}
if (-not (Test-Path (Join-Path $raiz "backend\.env"))) {
    throw "backend\.env nao encontrado. Copie backend\.env.example para backend\.env e preencha as credenciais REAIS do Prevision e do Mega antes de instalar o servico."
}

Write-Host "Instalando a dependencia pywin32 (se faltar)..." -ForegroundColor Cyan
& $python -m pip install pywin32 --quiet
$postinstall = Join-Path (Split-Path $python) "pywin32_postinstall.py"
if (Test-Path $postinstall) {
    & $python $postinstall -install | Out-Null
}

Write-Host "Registrando o servico 'PainelEngenharia'..." -ForegroundColor Cyan
& $python $servico --startup auto install

Write-Host "Configurando reinicio automatico em caso de falha..." -ForegroundColor Cyan
# reinicia apos 5s na 1a, 2a e 3a falha, dentro de uma janela de 24h (86400s)
sc.exe failure PainelEngenharia reset= 86400 actions= restart/5000/restart/5000/restart/5000 | Out-Null

Write-Host "Iniciando o servico..." -ForegroundColor Cyan
& $python $servico start

Write-Host ""
Write-Host "Pronto. 'Painel de Engenharia' esta instalado como servico e inicia sozinho com o Windows." -ForegroundColor Green
Write-Host "Acompanhar: services.msc (nome 'PainelEngenharia') ou backend\data\logs\servico.log" -ForegroundColor Green
Write-Host "Para desinstalar depois: .\deploy\desinstalar_servico.ps1" -ForegroundColor Green
Write-Host ""
