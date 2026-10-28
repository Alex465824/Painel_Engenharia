# Deploy em servidor Windows

Checklist para colocar o Painel de Engenharia rodando como Servico do Windows (inicia sozinho
com o servidor, reinicia sozinho se cair).

## 1. Pré-requisitos no servidor

- **Python 3.13** (mesma versão usada no desenvolvimento) — https://www.python.org/downloads/
  Marque "Add python.exe to PATH" na instalação.
- **Oracle Instant Client** (para o Mega funcionar — sem isso o database link falha com
  `ORA-28267`, ver `README.md`). Baixe em
  https://www.oracle.com/database/technologies/instant-client/downloads.html e anote a pasta
  onde extraiu (ex.: `C:\Oracle\instantclient_23_26`).
- Porta liberada no firewall do Windows (padrão **8090** — `New-NetFirewallRule -DisplayName "Painel de Engenharia" -Direction Inbound -LocalPort 8090 -Protocol TCP -Action Allow`).
- Acesso de rede do servidor para: a API do Prevision (HTTPS) e o host/porta do Mega
  (`dbconnect.megaerp.online:4221` ou o que estiver em produção).

## 2. Primeira instalação

```powershell
# 1. Clonar o repositório
git clone https://github.com/Alex465824/Painel_Engenharia.git
cd Painel_Engenharia

# 2. Criar o ambiente e instalar as dependências (cria backend\.venv e backend\.env a partir do exemplo)
.\iniciar.ps1
# Ctrl+C assim que ele disser "rodando em http://localhost:8090" - é só para preparar o ambiente.

# 3. Preencher backend\.env com as credenciais REAIS de produção
notepad backend\.env
#   - PREVISION_API_KEY
#   - MEGA_DB_HOST / MEGA_DB_PORT / MEGA_DB_SERVICE_NAME / MEGA_DB_USER / MEGA_DB_PASSWORD
#   - MEGA_DB_SCHEMA / MEGA_DB_LINK
#   - MEGA_ORACLE_CLIENT_DIR -> a pasta do Instant Client (passo 1)

# 4. Instalar como serviço do Windows (como Administrador)
.\deploy\instalar_servico.ps1
```

Depois disso o painel fica em `http://<ip-do-servidor>:8090` e sobe sozinho a cada boot do
servidor.

## 3. Operação do dia a dia

| O que | Como |
|---|---|
| Ver se está rodando | `services.msc` → serviço "Painel de Engenharia" (nome interno `PainelEngenharia`) |
| Ver logs | `backend\data\logs\servico.log` |
| Reiniciar | `Restart-Service PainelEngenharia` |
| Parar | `Stop-Service PainelEngenharia` |
| Desinstalar | `.\deploy\desinstalar_servico.ps1` |
| Atualizar o código | `git pull`, depois `pip install -r backend\requirements.txt` dentro do venv se o `requirements.txt` mudou, depois `Restart-Service PainelEngenharia` |

## 4. Dados e backup

- O banco é um arquivo único SQLite: `backend\data\painel_engenharia.db`. É só um **retrato**
  recalculado do Prevision/Mega (cache + metas + vínculos configurados em Configurações) — se
  perder o arquivo, o painel reconstrói os dados na próxima subida, mas **perde os vínculos
  obra↔empresa e obra↔Mega configurados manualmente**. Vale incluir esse arquivo numa rotina de
  backup do servidor.
- `backend\.env` tem credenciais em texto puro — restrinja o acesso de leitura à pasta
  `backend\` para o usuário/serviço que roda a aplicação.

## 5. Limitações conhecidas a considerar antes de expor na rede

- **Sem autenticação**: qualquer pessoa com acesso de rede ao endereço do servidor entra no
  painel direto. Se o servidor for acessível fora da rede interna, considere colocar atrás de
  um reverse proxy com autenticação (IIS + Application Request Routing, ou um proxy com SSO),
  ou restringir por firewall/VPN.
- **Um processo único**: não há balanceamento/múltiplas instâncias. Para a escala atual (10
  obras, uso interno) um único processo é suficiente.
- Ver `README.md` para as pendências de dados (fórmulas a confirmar, obras sem vínculo Mega
  etc.) — são lacunas de informação de negócio, não bloqueiam o deploy.
