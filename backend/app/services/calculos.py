"""Calculos puros sobre os dados brutos do Prevision (sem rede, sem banco).

FORMULAS CALIBRADAS contra o dashboard nativo do Prevision (obra ARBO, 2026-10-07).
Os numeros batem exatos, entao nao sao aproximacoes nossas:

  Realizado = media de `percentage_completed` ponderada por `duration`   (ARBO 61,14%)
  Previsto  = media de `expected_percentage_completed` ponderada por `duration` (60,81%)
  Base      = media ponderada por `duration` do % que a LINHA DE BASE preve concluido
              hoje, interpolando linear entre `base_start_at` e `base_end_at`  (94,59%)
  IDP       = Realizado / Base                                           (0,65)
  Atraso    = max(`end_at`) - max(`base_end_at`), em dias                (7 dias)

Ponderar por `cost` NAO bate (dava 74,68% na ARBO). A ponderacao correta e por duracao.

Sobre o cronograma fisico-financeiro (cff): as linhas formam uma WBS hierarquica
(`code` "01", "01.02", ...). O CUSTO agrega certinho (pai = soma dos filhos, validado em
100% dos nos). O PROGRESSO nao e aditivo entre niveis (so ~40% dos pais batem com a soma
dos filhos), entao o % de cada no vem sempre da razao realizado/base da PROPRIA linha.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta


def parse_data(valor: str | None) -> date | None:
    if not valor:
        return None
    return datetime.fromisoformat(str(valor).replace("Z", "+00:00")).date()


def _iso(d: date | None) -> str | None:
    return d.isoformat() if d else None


def media_ponderada(itens: list[dict], campo_pct: str, campo_peso: str = "duration") -> float:
    num = den = 0.0
    for item in itens:
        peso = item.get(campo_peso) or 0
        num += peso * (item.get(campo_pct) or 0)
        den += peso
    return round(num / den, 2) if den else 0.0


def pct_linha_base(atividade: dict, referencia: date) -> float | None:
    inicio = parse_data(atividade.get("base_start_at"))
    fim = parse_data(atividade.get("base_end_at"))
    if not inicio or not fim:
        return None
    if referencia >= fim:
        return 100.0
    if referencia <= inicio:
        return 0.0
    return (referencia - inicio).days / ((fim - inicio).days or 1) * 100


# --------------------------------------------------------------------------- avanco


def avanco_fisico(atividades: list[dict], referencia: date) -> dict:
    realizado = media_ponderada(atividades, "percentage_completed")
    previsto = media_ponderada(atividades, "expected_percentage_completed")

    num = den = 0.0
    for a in atividades:
        pct = pct_linha_base(a, referencia)
        if pct is not None:
            peso = a.get("duration") or 0
            num += peso * pct
            den += peso
    base = round(num / den, 2) if den else 0.0

    inicios = [d for d in (parse_data(a.get("start_at")) for a in atividades) if d]
    fins = [d for d in (parse_data(a.get("end_at")) for a in atividades) if d]
    base_fins = [d for d in (parse_data(a.get("base_end_at")) for a in atividades) if d]
    data_inicio = min(inicios) if inicios else None
    data_fim = max(fins) if fins else None
    data_fim_base = max(base_fins) if base_fins else None

    vencidas = sum(
        1 for a in atividades
        if (parse_data(a.get("end_at")) or referencia) < referencia and (a.get("percentage_completed") or 0) < 100
    )
    return {
        "base_pct": base,
        "previsto_pct": previsto,
        "realizado_pct": realizado,
        "idp": round(realizado / base, 2) if base else None,
        "atraso_dias": (data_fim - data_fim_base).days if data_fim and data_fim_base else None,
        "data_inicio": _iso(data_inicio),
        "data_fim_prevista": _iso(data_fim),
        "data_fim_base": _iso(data_fim_base),
        "dias_desde_inicio": (referencia - data_inicio).days if data_inicio else None,
        "dias_para_fim": (data_fim - referencia).days if data_fim else None,
        "total_atividades": len(atividades),
        "atividades_concluidas": sum(1 for a in atividades if (a.get("percentage_completed") or 0) >= 100),
        "atividades_atrasadas": sum(
            1 for a in atividades
            if (a.get("percentage_completed") or 0) < (a.get("expected_percentage_completed") or 0) - 1
        ),
        "atividades_vencidas": vencidas,
        "atividades_sem_base": sum(1 for a in atividades if not a.get("base_end_at")),
    }


def status_obra(av: dict) -> str:
    if av["total_atividades"] == 0 or (av["base_pct"] <= 0 and av["realizado_pct"] <= 0):
        return "nao_iniciada"
    if av["realizado_pct"] >= 99.9:
        return "concluida"
    return "atrasada" if (av["atraso_dias"] or 0) > 0 else "no_prazo"


# ------------------------------------------------------------------- cff / curva S


def _nivel1(rows: list[dict]) -> list[dict]:
    """Itens de nivel 1 da WBS. Somar todos os niveis duplicaria pai + filhos."""
    return [r for r in rows if "." not in str(r.get("code") or "")]


def _soma(r: dict, chave: str) -> float:
    return sum((r.get(chave) or {}).values())


def curva_s_e_mensal(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    """Curva S acumulada e avanco mensal (% do total), normalizados pelo total da linha de base."""
    topo = _nivel1(rows)
    total = sum(_soma(r, "base") for r in topo)
    if not total:
        return [], []
    meses = sorted({m for r in topo for k in ("base", "expected", "realized") for m in (r.get(k) or {})})
    ultimo_real = max((m for r in topo for m in (r.get("realized") or {})), default=None)

    acumulado = {"base": 0.0, "expected": 0.0, "realized": 0.0}
    curva, mensal = [], []
    for mes in meses:
        do_mes = {k: sum((r.get(k) or {}).get(mes, 0) for r in topo) for k in acumulado}
        for k in acumulado:
            acumulado[k] += do_mes[k]
        tem_real = bool(ultimo_real and mes <= ultimo_real)
        curva.append({
            "mes": mes,
            "base_pct": round(acumulado["base"] / total * 100, 2),
            "previsto_pct": round(acumulado["expected"] / total * 100, 2),
            "realizado_pct": round(acumulado["realized"] / total * 100, 2) if tem_real else None,
        })
        mensal.append({
            "mes": mes,
            "base_pct": round(do_mes["base"] / total * 100, 2),
            "previsto_pct": round(do_mes["expected"] / total * 100, 2),
            "realizado_pct": round(do_mes["realized"] / total * 100, 2) if tem_real else None,
        })
    return curva, mensal


def _ultimo_mes_medido(rows: list[dict]) -> str | None:
    return max((m for r in rows for m in (r.get("realized") or {})), default=None)


def _custo(r: dict) -> float:
    b = r.get("budget_item") or {}
    return float((b.get("material_cost") or 0) + (b.get("labor_cost") or 0))


def _ratios(r: dict, ultimo_mes: str | None) -> tuple[float, float]:
    base = _soma(r, "base")
    if not base:
        return 0.0, 0.0
    prev = sum(v for m, v in (r.get("expected") or {}).items() if ultimo_mes is None or m <= ultimo_mes)
    return round(_soma(r, "realized") / base * 100, 2), round(prev / base * 100, 2)


def pacotes(rows: list[dict]) -> list[dict]:
    ultimo = _ultimo_mes_medido(rows)
    saida = []
    for r in _nivel1(rows):
        real, prev = _ratios(r, ultimo)
        item = r.get("budget_item") or {}
        saida.append({
            "codigo": str(r.get("code")),
            "descricao": item.get("description") or "",
            "custo_orcado": round(_custo(r), 2),
            "pct_realizado": real,
            "pct_previsto": prev,
        })
    return sorted(saida, key=lambda p: -p["custo_orcado"])


def arvore(rows: list[dict]) -> list[dict]:
    """WBS aninhada. O pai de um no e o ancestral mais proximo que existe (os codigos pulam niveis)."""
    ultimo = _ultimo_mes_medido(rows)
    nos: dict[str, dict] = {}
    for r in rows:
        cod = str(r.get("code"))
        real, prev = _ratios(r, ultimo)
        nos[cod] = {
            "codigo": cod,
            "descricao": (r.get("budget_item") or {}).get("description") or "",
            "custo_orcado": round(_custo(r), 2),
            "pct_realizado": real,
            "pct_previsto": prev,
            "filhos": [],
        }
    raiz = []
    for cod in sorted(nos, key=lambda c: [int(p) if p.isdigit() else p for p in c.split(".")]):
        partes = cod.split(".")
        pai = None
        for n in range(len(partes) - 1, 0, -1):
            candidato = ".".join(partes[:n])
            if candidato in nos:
                pai = candidato
                break
        (nos[pai]["filhos"] if pai else raiz).append(nos[cod])
    return raiz


# ---------------------------------------------------------------------- atividades


def compactar_atividades(atividades: list[dict], referencia: date) -> list[dict]:
    saida = []
    for a in atividades:
        fim = parse_data(a.get("end_at"))
        base_fim = parse_data(a.get("base_end_at"))
        real = a.get("percentage_completed") or 0
        saida.append({
            "servico": a.get("service_name") or "",
            "pavimento": a.get("floor_name") or "",
            "inicio": _iso(parse_data(a.get("start_at"))),
            "fim": _iso(fim),
            "base_inicio": _iso(parse_data(a.get("base_start_at"))),
            "base_fim": _iso(base_fim),
            "duracao": a.get("duration") or 0,
            "real": real,
            "previsto": a.get("expected_percentage_completed") or 0,
            "custo": round(a.get("cost") or 0, 2),
            "atraso_dias": (fim - base_fim).days if fim and base_fim else None,
            "vencida": bool(fim and fim < referencia and real < 100),
        })
    return saida


def _agregar(atividades: list[dict], chave: str) -> list[dict]:
    grupos: dict[str, list[dict]] = defaultdict(list)
    for a in atividades:
        grupos[a[chave]].append(a)
    saida = []
    for nome, itens in grupos.items():
        inicios = [i["inicio"] for i in itens if i["inicio"]]
        fins = [i["fim"] for i in itens if i["fim"]]
        b_ini = [i["base_inicio"] for i in itens if i["base_inicio"]]
        b_fim = [i["base_fim"] for i in itens if i["base_fim"]]
        atrasos = [i["atraso_dias"] for i in itens if i["atraso_dias"] is not None]
        saida.append({
            "nome": nome,
            "n": len(itens),
            "inicio": min(inicios) if inicios else None,
            "fim": max(fins) if fins else None,
            "base_inicio": min(b_ini) if b_ini else None,
            "base_fim": max(b_fim) if b_fim else None,
            "real": media_ponderada(itens, "real", "duracao"),
            "previsto": media_ponderada(itens, "previsto", "duracao"),
            "vencidas": sum(1 for i in itens if i["vencida"]),
            "atrasadas": sum(1 for i in itens if i["real"] < i["previsto"] - 1),
            "atraso_max_dias": max(atrasos) if atrasos else None,
            "duracao": sum(i["duracao"] for i in itens),
        })
    return sorted(saida, key=lambda g: (g["inicio"] or "9999", g["nome"]))


def por_servico(compactas: list[dict]) -> list[dict]:
    return _agregar(compactas, "servico")


def por_pavimento(compactas: list[dict]) -> list[dict]:
    return _agregar(compactas, "pavimento")


def mapa_avanco(compactas: list[dict], max_servicos: int = 45) -> dict:
    """Matriz pavimento x servico. Ordem cronologica (sequencia construtiva), nao alfabetica."""
    servicos = sorted(_agregar(compactas, "servico"), key=lambda g: -g["duracao"])[:max_servicos]
    nomes_serv = {s["nome"] for s in servicos}
    servicos.sort(key=lambda g: (g["inicio"] or "9999", g["nome"]))
    pavimentos = _agregar([a for a in compactas if a["servico"] in nomes_serv], "pavimento")
    celulas: dict[str, list] = {}
    por_celula: dict[tuple, list[dict]] = defaultdict(list)
    for a in compactas:
        if a["servico"] in nomes_serv:
            por_celula[(a["pavimento"], a["servico"])].append(a)
    for (pav, serv), itens in por_celula.items():
        celulas[f"{pav}||{serv}"] = [
            media_ponderada(itens, "real", "duracao"),
            media_ponderada(itens, "previsto", "duracao"),
        ]
    return {
        "pavimentos": [p["nome"] for p in pavimentos],
        "servicos": [s["nome"] for s in servicos],
        "celulas": celulas,
    }


# ---------------------------------------------------------------------------- lean


def janelas_semanais(referencia: date, semanas: int = 8) -> list[tuple[date, date]]:
    fins = [referencia - timedelta(days=7 * i) for i in range(semanas)][::-1]
    return [(f - timedelta(days=6), f) for f in fins]


def causas_atraso(lotes: list[list[dict]]) -> dict:
    """Pareto de causas de atraso nos apontamentos das ultimas medicoes + cobertura do registro."""
    total = atrasados = com_motivo = 0
    contagem: Counter = Counter()
    for lote in lotes:
        for x in lote:
            total += 1
            atrasado = (x.get("percentage_completed") or 0) < (x.get("expected_percentage_completed") or 0)
            if atrasado:
                atrasados += 1
            motivos = x.get("delay_reasons") or []
            if motivos and atrasado:
                com_motivo += 1
            for m in motivos:
                contagem[m] += 1
    return {
        "medicoes_analisadas": len(lotes),
        "apontamentos": total,
        "atrasados": atrasados,
        "atrasados_com_motivo": com_motivo,
        "cobertura_pct": round(com_motivo / atrasados * 100, 1) if atrasados else None,
        "motivos": [
            {"motivo": m, "categoria": m.split("|")[0].strip(), "n": n}
            for m, n in contagem.most_common(12)
        ],
    }


# -------------------------------------------------------------- produtividade / medicoes


def produtividade(linhas: list[dict]) -> dict:
    iniciados = []
    for r in linhas:
        if (r.get("realized") or 0) <= 0:
            continue  # nao iniciado: produtividade zero nao e desvio, e so trabalho por comecar
        iniciados.append({
            "servico": r.get("service_name") or "",
            "grupo": r.get("replication_group_name") or "",
            "pavimentos": r.get("total_floors"),
            "realizados": r.get("realized"),
            "saldo": r.get("balance"),
            "base": r.get("baseline_productivity"),
            "prevista": r.get("expected_productivity"),
            "realizada": r.get("realized_productivity"),
            "desvio": r.get("deviation"),
            "ultima_medicao": str(r.get("last_measurement_date") or "")[:10] or None,
            "tendencia_fim": str(r.get("trend") or "")[:10] or None,
        })
    iniciados.sort(key=lambda x: (x["desvio"] is None, x["desvio"]))
    return {
        "total": len(linhas),
        "iniciados": len(iniciados),
        "nao_iniciados": len(linhas) - len(iniciados),
        "abaixo_do_planejado": sum(1 for x in iniciados if (x["desvio"] or 0) < 0),
        "linhas": iniciados,
    }


def medicoes(itens: list[dict], referencia: date) -> dict:
    datas = sorted({str(i["measured_in"])[:10] for i in itens}, reverse=True)
    intervalos = []
    for a, b in zip(datas, datas[1:]):
        intervalos.append((parse_data(a) - parse_data(b)).days)
    ultima = parse_data(datas[0]) if datas else None
    return {
        "total": len(datas),
        "ultima": datas[0] if datas else None,
        "dias_desde_ultima": (referencia - ultima).days if ultima else None,
        "intervalo_medio_dias": round(sum(intervalos[:8]) / len(intervalos[:8]), 1) if intervalos else None,
        "datas": datas[:40],
    }


_NATURAL = re.compile(r"(\d+)")


def chave_natural(texto: str) -> list:
    return [int(p) if p.isdigit() else p.lower() for p in _NATURAL.split(texto or "")]
