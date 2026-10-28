# Painel de Engenharia

Painel de acompanhamento das obras do Grupo Gadens, para a área de Engenharia (Planejamento e Controle).
Lê o **Prevision** e o **Mega** (conectado em 2026-10-28); planilhas internas (histograma, consumo) ainda pendentes.

Aplicação de verdade: FastAPI + HTML/JS puro servido pelo próprio FastAPI, banco SQLite, gráficos em SVG.
**Não precisa de Node.js** nem de build. Mesmo padrão do Portal do Conselho.

## Como rodar

```powershell
.\iniciar.ps1
```

Abre em `http://localhost:8090` (e mostra o endereço na rede interna). Na primeira execução cria o ambiente,
instala as dependências, cria `backend\.env` a partir do exemplo e busca as obras no Prevision (cerca de 25 s).

Credenciais ficam em `backend\.env` (nunca vai para o controle de versão): `PREVISION_API_KEY`, `MEGA_DB_*`.

## O que tem

Ao abrir, escolhe-se a empresa (**Gadens** ou **Make IT**); os menus liberados mudam conforme a empresa.
A liberação por empresa foi **inferida do BI atual** e não confirmada com o time — mude em `frontend/static/js/menu.js`
(lista `empresas` de cada item; é o único lugar dessa regra).

| Menu | O que mostra | Fonte |
|---|---|---|
| Consolidado | KPIs, "atenção agora", comparativo das obras com PPC de 8 semanas, rankings de IDP/PPC/atraso, evolução do portfólio | Prevision |
| Visão geral da obra | Informações gerais, performance de prazo e avanço, base/previsto/realizado, curva S, pontos de atenção | Prevision |
| Evolução física | Curva S, avanço por mês, pacotes, **mapa de avanço pavimento × serviço** | Prevision |
| Cronograma | **Gantt** por serviço ou pavimento com linha de base, filtros e detalhe por atividade | Prevision |
| Atrasos | Atividades vencidas, atrás do plano e escorregadas da base; ranking por serviço e pavimento | Prevision |
| Custos | Orçamento em árvore (WBS) com avanço por item. Realizado e tendência dependem do Mega | Prevision (+ Mega pendente) |
| Medições | Cadência e defasagem das medições | Prevision |
| Semanal e Lean *(Make IT)* | PPC e aderência semanais, causas de atraso e a cobertura do registro delas | Prevision |
| Produtividade *(Make IT)* | Produtividade por serviço, maiores desvios | Prevision |
| Restrições *(Make IT)* | Cadastro, importação de planilha e os indicadores do BI (contadores, pizzas, por categoria) | Registradas no painel |
| Histograma de obras / Controle de consumo *(Make IT)* | Aguardam as planilhas do Excel | Excel (pendente) |
| Incorporação *(Gadens)* | Aguarda token com escopo de incorporação | Prevision (pendente) |
| Follow up de compras, Custo por nível, Realizado (Crystal), Contratos e medições | Acesso ao Mega já funciona; tabelas mapeadas (ver abaixo); telas ainda não construídas | Mega |
| Integrações | Estado de cada fonte, com verificação ao vivo | — |
| Configurações | Vínculo obra → empresa, metas e limiares, estado dos dados | — |

Os alertas (sino) são calculados na hora a partir dos dados e das metas configuradas.

## Como os dados fluem

O painel **nunca consulta o Prevision enquanto alguém navega**. Ele grava um retrato calculado de cada obra
(`backend/data/painel_engenharia.db`) e as telas leem dele: rápido, e continua de pé se o Prevision estiver fora.
O retrato é refeito sozinho ao subir o servidor se tiver mais de 6 h, ou pelo botão **Atualizar** (em segundo plano,
com barra de progresso). Cada atualização também grava um retrato do dia por obra — é daí que sai a **evolução
no tempo**, que o Prevision não informa (ele só entrega o agora). O histórico só existe a partir do primeiro dia de uso.

## Fórmulas (calibradas contra o dashboard nativo do Prevision)

Conferidas com a obra ARBO: batem exatas, não são aproximações.

- **Realizado / Previsto** = média ponderada pela **duração** das atividades (ponderar por custo *não* bate)
- **Base** = % que a linha de base prevê concluído hoje, interpolando entre início e fim de cada atividade, ponderado pela duração
- **IDP** = Realizado ÷ Base
- **Atraso** = término atual − término da linha de base, em dias

No orçamento em árvore o **custo agrega certinho** (pai = soma dos filhos), mas o **progresso não é aditivo** entre níveis,
então o % de cada item é a razão realizado ÷ base da própria linha. Detalhes em `backend/app/services/calculos.py`.

## Limites conhecidos

- **Sem autenticação.** Quem alcança a URL vê tudo, incluindo dados de custo. Se for aberto além da rede interna, autenticação
  (ex.: Entra ID) é o próximo passo obrigatório. O `iniciar.ps1` escuta em `0.0.0.0`.
- **Vínculo obra → empresa não definido.** O módulo de incorporação do Prevision responde 401 com o token atual, então não dá
  para deduzir. Defina em Configurações; até lá as duas empresas veem todas as obras.
- **Token do Prevision** só cobre obras e cronograma. Incorporação e Gestão de custos respondem 401.
- **Restrições**: a API do Prevision não as publica (nenhum dos 16 endpoints). Ficam registradas aqui; prefira importar a
  planilha exportada do Prevision a digitar duas vezes.
- **Mega**: conexão e database link funcionando (resolvido em 2026-10-28 — ver "Mega: tabelas mapeadas" abaixo).
  **Follow up de compras** e **Realizado (Caixa)** já têm tela construída (ver abaixo). Custo por nível e contratos ainda não.
  O Realizado é **valor bruto, sem a correção/encargo que o Mega aplica** — avisado na própria tela.
- **Metas**: IDP 0,90 / IDC 0,90 / IQO 0,80 vêm do BI atual. A de **PPC (80%) é premissa minha**, não vem do BI — confirme.
- **Aderência** vem do campo `grip` da API e passa de 100% (chegou a 1.355% numa obra na reta final); o gráfico corta em 200%.
- Só **10 obras** hoje, todas do Prevision; obras que existam só no Mega não aparecem.

## Estrutura

```
iniciar.ps1                 sobe tudo
backend/app/
  main.py                   FastAPI: API em /api + frontend estático na raiz
  config.py, database.py, db_models.py
  connectors/prevision.py   cliente da API (cliente único, teto de concorrência, retentativa)
  connectors/mega.py        Oracle via database link, modo thick (ver secao Mega abaixo)
  connectors/planilhas.py   leitor de Excel (a ligar quando as planilhas chegarem)
  services/calculos.py      fórmulas puras (sem rede nem banco)
  services/engine.py        busca, calcula, grava o retrato e atualiza em segundo plano
  services/alertas.py       regras de alerta
  routers/                  obras, admin (config/integrações), restricoes
backend/data/               banco SQLite (gerado)
frontend/index.html
frontend/static/            css, img (logo oficial) e js (app, menu, store, ui, charts, graficos, views/)
```

Documentação interativa da API em `/docs`.

## Mega: tabelas mapeadas (2026-10-28)

**O bloqueio era o driver, não o Mega.** `ORA-28267: Invalid NameSpace Value` acontecia porque o `oracledb`
roda em modo **thin** (puro Python) por padrão, e o logon do database link no servidor remoto só funciona
em modo **thick** (biblioteca cliente Oracle de verdade). A correção é `MEGA_ORACLE_CLIENT_DIR` no `.env`,
apontando para um Oracle Instant Client instalado — `app/connectors/mega.py` liga o modo thick sozinho.
Baixe em https://www.oracle.com/database/technologies/instant-client/downloads.html se a máquina não tiver.

Cadeia de compras já mapeada no schema `GADENS` (rodar `backend/scripts/descobrir_mega.py` lista tudo de novo):

```
EST_SOLICITACAO  (solicitação)
  -> EST_SOLICPEDIDO      (vínculo solicitação -> pedido)
  -> EST_PEDCOMPRAS + EST_ITENSPEDCOMPRA   (pedido de compra e itens)
  -> EST_COTAPEDIDO + EST_COTACOES         (cotação)
  -> EST_RECEBIMENTO + EST_ITENSRECEB      (recebimento)
Fornecedor: GLO_AGENTES (nome/fantasia) + GLO_FORNECEDOR (flags)
```

A tela nativa do Mega ("Pedidos de Compra", relatório `R_ADM_Pedido_Compras_Por_DBM.rpt`) lista por **item**,
não por pedido — um pedido com 5 itens vira 5 linhas. O painel replica essa grade. A situação que a tela nativa
mostra colorida é a do **item** (`EST_ITENSPEDCOMPRA.ITP_ST_SITUACAO`), não a do cabeçalho do pedido
(`EST_PEDCOMPRAS.PDC_ST_SITUACAO`) — são vocabulários diferentes (ex.: pedido com cabeçalho `PR` pode ter todos
os itens em `RA`). Confirmado em 2026-10-28 comparando ao vivo a tela nativa (filial 100 "FILIAL TESTE",
pedidos 71-99) com o código cru — bateu 13/13: **PB = Pedido atendido** (verde), **PA = Pedido não atendido**
(cinza), **RA = Recusado por alçada** (laranja). Os códigos `PC` e `AA` aparecem na tela nativa mas ainda não
têm rótulo confirmado — o painel mostra o código cru com "(a confirmar)". Chaves são sempre compostas
(`ORG_TAB_IN_CODIGO` + `ORG_PAD_IN_CODIGO` + `ORG_IN_CODIGO` + `ORG_TAU_ST_CODIGO`, e `SER_TAB_IN_CODIGO` +
`SER_IN_SEQUENCIA` para documentos) — join pela chave incompleta duplica ou mistura filial.

**Obra ↔ Mega (validado em 10/10 obras, 2026-10-28):** cada obra do Prevision é uma SPE própria em `GLO_AGENTES`,
sempre em par — uma variante "- CONSOLIDADORA" (sem pedido nenhum, é só a casca contábil) e a variante operacional
(com os pedidos de verdade, `FIL_IN_CODIGO` = `AGN_IN_CODIGO` dela). `backend/app/services/compras_mega.py` acha
esse par pelo nome da obra (todas as palavras, não só a primeira — "CORE PALACIO" x "CORE SILVA JARDIM" x "CORE
FAIVRE" são ambíguos só pela primeira palavra) e confirma pela quantidade de pedidos. Mapeamento atual:

```
TUO=87  FLOW=114  CORE PALACIO=45  CORE SILVA JARDIM=144  BRAVO=89
UNIQ=107  ESSENCE=118  ARBO=111  NOW=112  LUME=103
```

O vínculo fica em `ObraConfig.mega_fil_in_codigo` (SQLite); `POST /api/config/obras/resolver-mega` refaz a
resolução para obras sem vínculo (não mexe em vínculo que o usuário confirmou manualmente em Configurações).

**Follow up de compras** (`frontend/static/js/views/compras.js`, API em `routers/compras.py`) já está construído
na mesma grade da tela nativa (item, não pedido): resumo (pedidos, itens, valor, fornecedores, período), itens
por situação (rótulo confirmado nos 3 códigos acima) e tabela paginada/filtrável/ordenável com as mesmas colunas
da tela nativa (Pedido, Série, Processo, Situação do item, Emissão, Fornecedor, Cond.Pagto, Contato, Situação do
pedido, Valor). Só o pedido em si por enquanto — cotação, solicitação, recebimento e as outras abas da tela nativa
(Rateio, Ocorrências, Programação de Entrega etc.) ficam para depois. Custo por nível e Contratos e medições
ainda nem foram mapeados.

## Mega: Realizado (módulo ADO, 2026-10-28)

Orçamento e custo realizado vêm de um módulo diferente do de compras: `ADO_*` (Administração de Obras), não
`EST_*`. Tabelas usadas: `ADO_ORCAMENTO` (cabeçalho do orçamento — tem `FIL_IN_CODIGO`, o **mesmo** código de
filial já resolvido para compras, nenhum mapeamento novo) + `ADO_NIVEL` (árvore por nível, como o WBS do
Prevision) + `ADO_FASE` (descrição e orçado de cada nível 1 — confere exato com a tela nativa) + `ADO_SERVICO`
(serviço/item do orçamento, cada um com seu `NIV_IN_CODIGO`) + `ADO_REALIZADO` (lançamento bruto, por
orçamento+serviço+insumo, com data). `ADO_VLRREALIZADO`, que parecia um cache pronto por nível/mês, está
**vazia no banco inteiro** — não dá pra usar.

**Qual orçamento usar quando a obra tem mais de um** (confirmado comparando com o relatório nativo "Realizado
Caixa" que o usuário exportou para a ARBO, 2026-10-28): o Mega usa o orçamento cujo nome bate com o nome da
obra (ex.: orçamento "ARBO", não "Indiretos ARBO"). Quando há mais de uma revisão com esse nome, usa a que tem
`ORC_CH_STATUS='A'` — forte pela amostra (a maioria dos orçamentos), mas o significado da letra em si **não
está confirmado**. `backend/app/services/realizado_mega.py` implementa essa escolha.

**O valor mostrado é bruto, sem indexação/correção monetária — avisado na própria tela.** Comparando o cálculo
direto de `ADO_REALIZADO.REA_RE_VALOR` com o relatório nativo da ARBO, o valor bruto às vezes fica abaixo do
oficial do Mega, às vezes acima — não é uma diferença de um percentual fixo, então não dá pra "corrigir" com um
fator simples. O Mega aplica algum encargo/correção que ainda não está confirmado com Suprimentos/Financeiro
(mesma pendência do INCC já registrada acima, em "Pendências"). Decisão do usuário (2026-10-28): mostrar o
bruto mesmo assim, com aviso explícito, em vez de esperar a fórmula.
