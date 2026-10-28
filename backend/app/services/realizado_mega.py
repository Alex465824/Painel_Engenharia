"""
Realizado (Caixa), a partir do orcamento do Mega (modulo ADO = Administracao de Obras).
Ver tambem services/compras_mega.py (mesmo banco, modulo EST).

QUAL ORCAMENTO USAR QUANDO A OBRA TEM MAIS DE UM (confirmado em 2026-10-28 comparando com o
relatorio nativo "Realizado Caixa" da ARBO, que o usuario enviou): o Mega tem, por filial, um
orcamento PRINCIPAL (nome igual ao da obra, ex. "ARBO") e as vezes orcamentos extras de escopo
diferente (ex. "Indiretos ARBO", "ARBO - A.T"). O relatorio nativo usa so o principal. Aqui a
escolha e: orcamento cujo ORC_ST_DESCRICAO normalizado (maiusculo, sem espaco/hifen/pontuacao)
bate com o nome da obra; se houver mais de uma revisao com esse nome, usa ORC_CH_STATUS='A'
(hipotese razoavel - e a maioria dos registros - mas a letra em si NAO esta confirmada).

ATENCAO - VALOR PRELIMINAR, SEM INDEXACAO: o valor de ADO_REALIZADO.REA_RE_VALOR e o lancamento
BRUTO. Comparado ao relatorio nativo da ARBO (2026-10-28), o bruto ficou ~7% abaixo do "Valor pago
acumulado" que o Mega mostra - o Mega aplica alguma correcao monetaria/encargo que ainda NAO esta
confirmada (mesma pendencia do INCC/Banda ja documentada na tela de Custos). Por decisao do
usuario, mostramos o valor bruto mesmo assim, com aviso explicito na tela.

Estrutura usada (nivel 1 = "fase"): ADO_NIVEL (arvore, por orcamento) + ADO_FASE (descricao e
orcado de cada fase - bate exato com o relatorio nativo) + ADO_SERVICO (servico/item, com seu
NIV_IN_CODIGO) + ADO_REALIZADO (lancamento, por ORC_IN_CODIGO+ORC_IN_SEQUENCIA+SVC_IN_CODIGO).
"""

from __future__ import annotations

import re

from app.connectors import mega

_NORMALIZA = re.compile(r"[^A-Z0-9]")


def _normalizar(s: str | None) -> str:
    return _NORMALIZA.sub("", (s or "").upper())


def resolver_orcamento(fil_in_codigo: int, nome_obra: str) -> dict | None:
    alvo = _normalizar(nome_obra)
    candidatos = mega.consultar(
        f"SELECT orc_in_codigo, orc_in_sequencia, orc_st_descricao, orc_ch_status, orc_re_total, orc_dt_referencia "
        f"FROM {mega.tabela('ADO_ORCAMENTO')} WHERE fil_in_codigo = :fil",
        {"fil": fil_in_codigo},
    )
    bateu = [c for c in candidatos if _normalizar(c["orc_st_descricao"]) == alvo]
    if not bateu:
        return None
    ativos = [c for c in bateu if c["orc_ch_status"] == "A"] or bateu
    ativos.sort(key=lambda c: c["orc_in_sequencia"], reverse=True)
    escolhido = ativos[0]
    return {
        "orc_in_codigo": escolhido["orc_in_codigo"],
        "orc_in_sequencia": escolhido["orc_in_sequencia"],
        "descricao": escolhido["orc_st_descricao"],
        "status": escolhido["orc_ch_status"],
        "orcado_total": float(escolhido["orc_re_total"] or 0),
        "data_referencia": escolhido["orc_dt_referencia"].date().isoformat() if escolhido["orc_dt_referencia"] else None,
        "ambiguo": len(bateu) > 1,
    }


def resumo_realizado(orc_in_codigo: int, orc_in_sequencia: int) -> dict:
    geral = mega.consultar_um(
        f"SELECT SUM(rea_re_valor) total, MIN(rea_dt_movimento) de_, MAX(rea_dt_movimento) ate_, COUNT(*) qtd "
        f"FROM {mega.tabela('ADO_REALIZADO')} WHERE orc_in_codigo = :orc AND orc_in_sequencia = :seq",
        {"orc": orc_in_codigo, "seq": orc_in_sequencia},
    ) or {}

    fases = mega.consultar(
        f"""
        SELECT n.niv_st_estruturado codigo, f.fase_st_descricao descricao, f.fase_re_total orcado
        FROM {mega.tabela('ADO_NIVEL')} n
        JOIN {mega.tabela('ADO_FASE')} f ON f.niv_in_codigo = n.niv_in_codigo
        WHERE n.orc_in_codigo = :orc AND n.orc_in_sequencia = :seq AND n.niv_in_nivel = 1
        ORDER BY n.niv_st_estruturado
        """,
        {"orc": orc_in_codigo, "seq": orc_in_sequencia},
    )
    por_fase = []
    for f in fases:
        realizado = mega.consultar_um(
            f"""
            SELECT SUM(r.rea_re_valor) total
            FROM {mega.tabela('ADO_REALIZADO')} r
            JOIN {mega.tabela('ADO_SERVICO')} s ON s.svc_in_codigo = r.svc_in_codigo
            JOIN {mega.tabela('ADO_NIVEL')} n ON n.niv_in_codigo = s.niv_in_codigo
              AND n.orc_in_codigo = r.orc_in_codigo AND n.orc_in_sequencia = r.orc_in_sequencia
            WHERE r.orc_in_codigo = :orc AND r.orc_in_sequencia = :seq
              AND n.niv_st_estruturado LIKE :prefixo
            """,
            {"orc": orc_in_codigo, "seq": orc_in_sequencia, "prefixo": f"{f['codigo']}%"},
        ) or {}
        orcado = float(f["orcado"] or 0)
        realizado_bruto = float(realizado.get("total") or 0)
        por_fase.append({
            "codigo": f["codigo"],
            "descricao": f["descricao"],
            "orcado": orcado,
            "realizado_bruto": realizado_bruto,
            "pct": round(realizado_bruto / orcado * 100, 1) if orcado else None,
        })

    return {
        "realizado_bruto_total": float(geral.get("total") or 0),
        "lancamentos": geral.get("qtd") or 0,
        "data_inicio": geral.get("de_").date().isoformat() if geral.get("de_") else None,
        "data_fim": geral.get("ate_").date().isoformat() if geral.get("ate_") else None,
        "por_fase": por_fase,
    }
