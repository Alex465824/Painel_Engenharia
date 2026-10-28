"""Regras de alerta. Calculadas na hora, a partir do retrato gravado + metas configuradas.

Os limiares vivem em Parametro (editaveis na tela de configuracoes). Os padroes abaixo sao
premissas minhas, nao regras confirmadas pelo time de Planejamento e Controle:
  - IDP: critico abaixo de 85% da meta, atencao abaixo da meta
  - PPC (4 semanas): critico abaixo de 50% da meta, atencao abaixo de 75% da meta
  - Atividades vencidas: atencao a partir de 5% do total, critico a partir de 15%
"""

from __future__ import annotations

from datetime import datetime, timedelta

ORDEM = {"critico": 0, "atencao": 1, "info": 2}


def _n(valor: float, casas: int = 0) -> str:
    """Numero no padrao brasileiro (virgula decimal, ponto de milhar)."""
    texto = f"{valor:,.{casas}f}"
    return texto.replace(",", "X").replace(".", ",").replace("X", ".")


def _d(iso: str | None) -> str:
    if not iso:
        return "—"
    a, m, d = iso[:10].split("-")
    return f"{d}/{m}/{a}"



def _alerta(sev: str, tipo: str, obra: dict | None, titulo: str, detalhe: str, view: str = "visao") -> dict:
    obra_id = obra["id"] if obra else None
    return {
        "id": f"{tipo}:{obra_id}",
        "severidade": sev,
        "tipo": tipo,
        "obra_id": obra_id,
        "obra": obra["nome"] if obra else None,
        "titulo": titulo,
        "detalhe": detalhe,
        "link": {"view": view, "obra": obra_id},
    }


def da_obra(r: dict, p: dict[str, float]) -> list[dict]:
    av, lean, med, nome = r["avanco"], r["lean"], r["medicoes"], r["nome"]
    status = r["status"]
    lista: list[dict] = []

    if status == "nao_iniciada" and av["base_pct"] > 0:
        lista.append(_alerta(
            "atencao", "inicio_atrasado", r, f"{nome}: devia ter começado",
            f"A linha de base já prevê {_n(av['base_pct'], 1)}% e não há avanço medido.",
        ))
    if status not in ("no_prazo", "atrasada"):
        return lista

    atraso = av["atraso_dias"] or 0
    if atraso >= p["atraso_critico_dias"]:
        lista.append(_alerta("critico", "prazo", r, f"{nome}: término {atraso} dias além da linha de base",
                             f"Previsto para {_d(av['data_fim_prevista'])}, a linha de base era {_d(av['data_fim_base'])}.", "cronograma"))
    elif atraso > 0:
        lista.append(_alerta("atencao", "prazo", r, f"{nome}: término {atraso} dias além da linha de base",
                             f"Previsto para {_d(av['data_fim_prevista'])}, a linha de base era {_d(av['data_fim_base'])}.", "cronograma"))

    idp, meta_idp = av["idp"], r["metas"]["idp"]
    if idp is not None:
        if idp < meta_idp * 0.85:
            lista.append(_alerta("critico", "idp", r, f"{nome}: IDP {_n(idp, 2)}",
                                 f"Muito abaixo da meta de {_n(meta_idp, 2)}: avanço real {_n(av['realizado_pct'], 1)}% "
                                 f"contra {_n(av['base_pct'], 1)}% da linha de base."))
        elif idp < meta_idp:
            lista.append(_alerta("atencao", "idp", r, f"{nome}: IDP {_n(idp, 2)}",
                                 f"Abaixo da meta de {_n(meta_idp, 2)}."))

    ppc, meta_ppc = lean["ppc_4s"], r["metas"]["ppc"]
    if ppc is not None and lean["semanas_com_plano"] > 0:
        if ppc < meta_ppc * 0.5:
            lista.append(_alerta("critico", "ppc", r, f"{nome}: PPC {_n(ppc)}% nas últimas 4 semanas",
                                 f"Menos da metade da meta de {_n(meta_ppc)}%: o planejado de curto prazo não está sendo cumprido.", "lean"))
        elif ppc < meta_ppc * 0.75:
            lista.append(_alerta("atencao", "ppc", r, f"{nome}: PPC {_n(ppc)}% nas últimas 4 semanas",
                                 f"Abaixo da meta de {_n(meta_ppc)}%.", "lean"))

    dias = med["dias_desde_ultima"]
    if dias is not None:
        if dias > p["medicao_critica_dias"]:
            quase_pronta = av["realizado_pct"] >= 95
            lista.append(_alerta(
                "critico", "medicao", r, f"{nome}: sem medição há {dias} dias",
                (f"A obra está em {_n(av['realizado_pct'], 1)}%: provavelmente terminou na prática e falta encerrar no Prevision."
                 if quase_pronta else "Os indicadores estão desatualizados."), "medicoes"))
        elif dias > p["medicao_atencao_dias"]:
            lista.append(_alerta("atencao", "medicao", r, f"{nome}: sem medição há {dias} dias",
                                 "Os indicadores podem estar desatualizados.", "medicoes"))

    total = av["total_atividades"] or 1
    share = av["atividades_vencidas"] / total
    if share >= 0.15:
        lista.append(_alerta("critico", "vencidas", r, f"{nome}: {av['atividades_vencidas']} atividades vencidas",
                             f"{_n(share * 100)}% das atividades passaram do prazo sem chegar a 100%.", "atrasos"))
    elif share >= 0.05:
        lista.append(_alerta("atencao", "vencidas", r, f"{nome}: {av['atividades_vencidas']} atividades vencidas",
                             f"{_n(share * 100)}% das atividades passaram do prazo sem chegar a 100%.", "atrasos"))

    cobertura = lean["causas"].get("cobertura_pct")
    if lean["causas"].get("atrasados", 0) >= 20 and cobertura is not None and cobertura < 20:
        lista.append(_alerta("info", "causas", r, f"{nome}: causa do atraso quase nunca é registrada",
                             f"Só {_n(cobertura)}% dos {lean['causas']['atrasados']} apontamentos atrasados "
                             f"recentes têm motivo informado.", "lean"))

    teste = [o["nome"] for o in r["orcamentos"] if "teste" in o["nome"].lower()]
    if teste:
        lista.append(_alerta("info", "orcamento_teste", r, f"{nome}: orçamento “{teste[0]}” parece ser de teste",
                             f"Ele soma R$ {_n(r['custo_orcado'])} no orçado total do portfólio.", "custos"))
    if not r["orcamentos"]:
        lista.append(_alerta("info", "sem_orcamento", r, f"{nome}: sem orçamento no Prevision",
                             "O custo da obra não pode ser acompanhado sem um orçamento cadastrado.", "custos"))
    return lista


def todos(resumos: list[dict], p: dict[str, float], ttl_horas: int) -> list[dict]:
    lista: list[dict] = []
    for r in resumos:
        lista.extend(da_obra(r, p))

    sem_empresa = [r["nome"] for r in resumos if not r.get("empresa")]
    if sem_empresa:
        lista.append({
            "id": "sem_empresa", "severidade": "info", "tipo": "sem_empresa", "obra_id": None, "obra": None,
            "titulo": f"{len(sem_empresa)} obras sem empresa definida",
            "detalhe": "Enquanto o vínculo não for definido, Gadens e Make IT enxergam todas as obras.",
            "link": {"view": "configuracoes", "obra": None},
        })

    if resumos:
        mais_velho = min(datetime.fromisoformat(r["atualizado_em"]) for r in resumos)
        if datetime.now() - mais_velho > timedelta(hours=ttl_horas * 2):
            horas = int((datetime.now() - mais_velho).total_seconds() // 3600)
            lista.append({
                "id": "dados_velhos", "severidade": "atencao", "tipo": "dados_velhos", "obra_id": None, "obra": None,
                "titulo": f"Dados do Prevision com {horas} h",
                "detalhe": "Use “Atualizar dados” para buscar o retrato mais recente.",
                "link": {"view": "configuracoes", "obra": None},
            })

    lista.sort(key=lambda a: (ORDEM[a["severidade"]], a["obra"] or "~"))
    return lista
