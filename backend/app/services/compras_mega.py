"""
Follow up de pedidos de compra, a partir do Mega (Oracle, via database link - ver connectors/mega.py).

CADEIA REAL (mapeada em 2026-10-28, `backend/scripts/descobrir_mega.py`):

    EST_SOLICITACAO  (solicitacao)
      -> EST_SOLICPEDIDO                     (vinculo solicitacao -> pedido)
      -> EST_PEDCOMPRAS + EST_ITENSPEDCOMPRA (pedido de compra e itens)
      -> EST_COTAPEDIDO + EST_COTACOES       (cotacao)
      -> EST_RECEBIMENTO + EST_ITENSRECEB    (recebimento)
    Fornecedor: GLO_AGENTES (nome/fantasia) + GLO_FORNECEDOR (flags, sem nome proprio)

Por ora so EST_PEDCOMPRAS (pedido, cabecalho) + EST_ITENSPEDCOMPRA (item) estao em uso - cotacao,
solicitacao e recebimento ficam para uma proxima etapa (pedir confirmacao do fluxo com Suprimentos
primeiro).

A tela "Pedidos de Compra" nativa do Mega (relatorio R_ADM_Pedido_Compras_Por_DBM.rpt) lista por
ITEM, nao por pedido - um pedido com 5 itens aparece em 5 linhas. Este modulo segue a mesma grade.

SITUACAO DO ITEM (ITP_ST_SITUACAO) - rotulo confirmado em 2026-10-28 comparando ao vivo a tela nativa
(filial 100 "FILIAL TESTE", pedidos 71-99) com os codigos crus no banco - bateu 13/13:
    PB -> "Pedido atendido"       (verde na tela nativa)
    PA -> "Pedido não atendido"   (cinza na tela nativa)
    RA -> "Recusado por alçada"   (laranja na tela nativa)
Codigos vistos mas NAO confirmados: PC, AA - mostrados crus, sem rotulo, ate confirmar com Suprimentos.
SITUACAO DO PEDIDO (PDC_ST_SITUACAO, cabecalho) e um vocabulario DIFERENTE do item (ex.: pedido 86 tem
cabecalho 'PR' com os 5 itens em 'RA') - nunca mostrar com o mesmo rotulo do item. Mostrado cru.

VINCULO OBRA -> MEGA (validado em 10/10 obras em 2026-10-28): cada obra e uma SPE propria em
GLO_AGENTES, sempre em par ("<nome> - CONSOLIDADORA" sem pedidos + a entidade operacional com os
pedidos reais). `resolver_filial()` acha esse par pelo nome da obra e confirma por ter pedidos.
"""

from __future__ import annotations

import re
from datetime import date, datetime

from app.connectors import mega

_SUFIXO_PAPEL = re.compile(r"\s*-\s*(CONSOLIDADORA|MATRIZ|FILIAL)\s*$")


def _normalizar(s: str | None) -> str:
    return _SUFIXO_PAPEL.sub("", (s or "").upper()).strip()


def _eh_consolidadora(linha: dict) -> bool:
    return "CONSOLIDADORA" in (linha.get("agn_st_fantasia") or "") or "CONSOLIDADORA" in (linha.get("agn_st_nome") or "")


def candidatos_filial(nome_obra: str) -> list[dict]:
    """Acha o par consolidadora+operacional cujo nome bate com o nome da obra (todas as palavras).
    Devolve so a parte OPERACIONAL do par (e a que tem FIL_IN_CODIGO com pedidos de verdade)."""
    tokens = [t for t in re.split(r"\s+", nome_obra.upper()) if t]
    if not tokens:
        return []
    condicoes = " AND ".join(f"UPPER(agn_st_nome) LIKE '%{t}%'" for t in tokens)
    linhas = mega.consultar(
        f"SELECT agn_in_codigo, agn_st_nome, agn_st_fantasia FROM {mega.tabela('GLO_AGENTES')} WHERE {condicoes}"
    )
    grupos: dict[str, list[dict]] = {}
    for linha in linhas:
        chave = _normalizar(linha.get("agn_st_fantasia")) or _normalizar(linha.get("agn_st_nome"))
        grupos.setdefault(chave, []).append(linha)

    candidatos = []
    for itens in grupos.values():
        if len(itens) >= 2 and any(_eh_consolidadora(i) for i in itens):
            candidatos.extend(i for i in itens if not _eh_consolidadora(i))
    return candidatos


def contar_pedidos(fil_in_codigo: int) -> dict:
    return mega.consultar_um(
        f"SELECT COUNT(*) qtd, SUM(pdc_re_totalpedido) total "
        f"FROM {mega.tabela('EST_PEDCOMPRAS')} WHERE fil_in_codigo = :fil",
        {"fil": fil_in_codigo},
    ) or {"qtd": 0, "total": None}


def resolver_filial(nome_obra: str) -> dict | None:
    """Escolhe, entre os candidatos, o que tem mais pedidos (confirma que e o operacional de verdade).
    Devolve None se nao achar nenhum candidato com pedido algum - obra sem nome claro no Mega ainda."""
    melhor: dict | None = None
    for c in candidatos_filial(nome_obra):
        fil = c["agn_in_codigo"]
        cont = contar_pedidos(fil)
        qtd = cont["qtd"] or 0
        if melhor is None or qtd > melhor["pedidos"]:
            melhor = {
                "fil_in_codigo": fil,
                "nome_mega": c["agn_st_nome"],
                "pedidos": qtd,
                "valor_total": float(cont["total"] or 0),
            }
    return melhor


# --------------------------------------------------------------------------- consultas de pedidos

SITUACAO_ITEM_LABELS = {
    "PB": "Pedido atendido",
    "PA": "Pedido não atendido",
    "RA": "Recusado por alçada",
}


def _parse_data(valor) -> str | None:
    if valor is None:
        return None
    if isinstance(valor, (date, datetime)):
        return valor.date().isoformat() if isinstance(valor, datetime) else valor.isoformat()
    return str(valor)[:10]


_JOIN_ITEM_PEDIDO = f"""
    {mega.tabela('EST_ITENSPEDCOMPRA')} i
    JOIN {mega.tabela('EST_PEDCOMPRAS')} p
      ON p.org_tab_in_codigo = i.org_tab_in_codigo AND p.org_pad_in_codigo = i.org_pad_in_codigo
     AND p.org_in_codigo = i.org_in_codigo AND p.ser_tab_in_codigo = i.ser_tab_in_codigo
     AND p.ser_in_sequencia = i.ser_in_sequencia AND p.pdc_in_codigo = i.pdc_in_codigo
    JOIN {mega.tabela('GLO_AGENTES')} a
      ON a.agn_tab_in_codigo = p.agn_tab_in_codigo AND a.agn_pad_in_codigo = p.agn_pad_in_codigo
     AND a.agn_in_codigo = p.agn_in_codigo
"""


def resumo_pedidos(fil_in_codigo: int) -> dict:
    situacoes = mega.consultar(
        f"SELECT i.itp_st_situacao situacao, COUNT(*) qtd FROM {_JOIN_ITEM_PEDIDO} "
        "WHERE p.fil_in_codigo = :fil GROUP BY i.itp_st_situacao ORDER BY qtd DESC",
        {"fil": fil_in_codigo},
    )
    geral = mega.consultar_um(
        f"SELECT COUNT(*) qtd, SUM(pdc_re_totalpedido) total, MIN(pdc_dt_emissao) de_, MAX(pdc_dt_emissao) ate_, "
        f"COUNT(DISTINCT agn_in_codigo) fornecedores "
        f"FROM {mega.tabela('EST_PEDCOMPRAS')} WHERE fil_in_codigo = :fil",
        {"fil": fil_in_codigo},
    ) or {}
    top_fornecedores = mega.consultar(
        f"""
        SELECT a.agn_st_fantasia fornecedor, COUNT(*) qtd, SUM(p.pdc_re_totalpedido) total
        FROM {mega.tabela('EST_PEDCOMPRAS')} p
        JOIN {mega.tabela('GLO_AGENTES')} a
          ON a.agn_tab_in_codigo = p.agn_tab_in_codigo AND a.agn_pad_in_codigo = p.agn_pad_in_codigo
         AND a.agn_in_codigo = p.agn_in_codigo
        WHERE p.fil_in_codigo = :fil
        GROUP BY a.agn_st_fantasia
        ORDER BY total DESC
        FETCH FIRST 10 ROWS ONLY
        """,
        {"fil": fil_in_codigo},
    )
    return {
        "total_pedidos": geral.get("qtd") or 0,
        "valor_total": float(geral.get("total") or 0),
        "fornecedores_distintos": geral.get("fornecedores") or 0,
        "data_inicio": _parse_data(geral.get("de_")),
        "data_fim": _parse_data(geral.get("ate_")),
        "total_itens": sum(s["qtd"] for s in situacoes),
        "por_situacao": [
            {"situacao": s["situacao"], "rotulo": SITUACAO_ITEM_LABELS.get(s["situacao"]), "qtd": s["qtd"]}
            for s in situacoes
        ],
        "top_fornecedores": [
            {"fornecedor": f["fornecedor"], "qtd": f["qtd"], "valor_total": float(f["total"] or 0)}
            for f in top_fornecedores
        ],
    }


ORDENS = {
    "emissao_desc": "p.pdc_dt_emissao DESC, i.itp_in_sequencia",
    "emissao_asc": "p.pdc_dt_emissao ASC, i.itp_in_sequencia",
    "valor_desc": "i.itp_re_vltotal DESC",
    "valor_asc": "i.itp_re_vltotal ASC",
}


def listar_pedidos(
    fil_in_codigo: int,
    situacao: str | None = None,
    busca: str | None = None,
    ordem: str = "emissao_desc",
    pagina: int = 0,
    por_pagina: int = 30,
) -> dict:
    """Lista por ITEM, igual à grade nativa do Mega (um pedido com 5 itens vira 5 linhas)."""
    condicoes = ["p.fil_in_codigo = :fil"]
    params: dict = {"fil": fil_in_codigo}
    if situacao:
        condicoes.append("i.itp_st_situacao = :situacao")
        params["situacao"] = situacao
    if busca:
        condicoes.append("UPPER(a.agn_st_fantasia) LIKE :busca")
        params["busca"] = f"%{busca.upper()}%"
    onde = " AND ".join(condicoes)
    order_by = ORDENS.get(ordem, ORDENS["emissao_desc"])

    total = mega.consultar_um(
        f"SELECT COUNT(*) qtd FROM {_JOIN_ITEM_PEDIDO} WHERE {onde}", params,
    )["qtd"]

    linhas = mega.consultar(
        f"""
        SELECT * FROM (
          SELECT p.pdc_in_codigo, p.ser_st_codigo, p.pdc_in_processo, p.pdc_dt_emissao,
                 p.pdc_st_situacao situacao_pedido, p.pdc_st_tipopedido, p.cond_st_codigo, p.pdc_st_contato,
                 p.agn_in_codigo cod_agente, a.agn_st_fantasia fornecedor,
                 i.itp_in_sequencia, i.itp_st_situacao situacao_item, i.itp_re_vltotal valor,
                 ROW_NUMBER() OVER (ORDER BY {order_by}) rn
          FROM {_JOIN_ITEM_PEDIDO}
          WHERE {onde}
        )
        WHERE rn > :inicio AND rn <= :fim
        """,
        {**params, "inicio": pagina * por_pagina, "fim": (pagina + 1) * por_pagina},
    )
    pedidos = [
        {
            "codigo": l["pdc_in_codigo"],
            "serie": l["ser_st_codigo"],
            "processo": l["pdc_in_processo"],
            "sequencia_item": l["itp_in_sequencia"],
            "emissao": _parse_data(l["pdc_dt_emissao"]),
            "situacao_item": l["situacao_item"],
            "situacao_item_rotulo": SITUACAO_ITEM_LABELS.get(l["situacao_item"]),
            "situacao_pedido": l["situacao_pedido"],
            "tipo": l["pdc_st_tipopedido"],
            "valor": float(l["valor"] or 0),
            "cod_agente": l["cod_agente"],
            "fornecedor": l["fornecedor"],
            "cond_pagto": l["cond_st_codigo"],
            "contato": l["pdc_st_contato"],
        }
        for l in linhas
    ]
    return {"total": total, "pagina": pagina, "por_pagina": por_pagina, "pedidos": pedidos}
