"""Orquestrador: busca no Prevision, calcula, grava o retrato no banco e serve as telas.

O painel NUNCA consulta o Prevision durante uma navegacao: as telas leem o retrato gravado
(rapido, e continua de pe se o Prevision estiver fora). A atualizacao roda em segundo plano
e e disparada na subida do servidor (se o retrato estiver velho) ou pelo botao "Atualizar".
"""

from __future__ import annotations

import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.connectors.prevision import PrevisionClient
from app.database import SessionLocal
from app.db_models import ObraCache, ObraConfig, Parametro, Snapshot
from app.services import calculos

PARAMETROS_PADRAO: dict[str, float] = {
    "meta_idp": 0.90,
    "meta_idc": 0.90,
    "meta_iqo": 0.80,
    "meta_ppc": 80.0,
    "atraso_critico_dias": 30,
    "medicao_atencao_dias": 10,
    "medicao_critica_dias": 21,
}

SEMANAS_LEAN = 8
MEDICOES_PARA_CAUSAS = 6

_trava = threading.Lock()
_estado: dict = {
    "rodando": False, "total": 0, "concluidas": 0, "em_andamento": [],
    "iniciado_em": None, "terminado_em": None, "erros": {},
}


# ------------------------------------------------------------------ construcao


def _ppc_aderencia(cliente: PrevisionClient, pid: int, inicio: date, fim: date) -> tuple[float, float]:
    d = cliente.indicadores_curto_prazo(pid, inicio.isoformat(), fim.isoformat())
    return round((d.get("ppc") or 0) * 100, 1), round((d.get("grip") or 0) * 100, 1)


def construir_obra(pid: int, nome: str, referencia: date | None = None) -> tuple[dict, dict]:
    """Busca tudo da obra no Prevision e devolve (resumo, detalhe) ja calculados."""
    ref = referencia or date.today()
    c = PrevisionClient()
    janelas = calculos.janelas_semanais(ref, SEMANAS_LEAN)
    avisos: list[str] = []

    with ThreadPoolExecutor(max_workers=8) as ex:
        f_atividades = ex.submit(c.atividades, pid)
        f_cff = ex.submit(c.cronograma_fisico_financeiro, pid)
        f_prod = ex.submit(c.produtividade, pid)
        f_med = ex.submit(c.medicoes, pid)
        f_orc = ex.submit(c.orcamentos, pid)
        f_semanas = [ex.submit(_ppc_aderencia, c, pid, ini, fim) for ini, fim in janelas]
        f_4s = ex.submit(_ppc_aderencia, c, pid, ref - timedelta(days=27), ref)

        # essenciais: sem elas a obra nao tem como ser montada
        atividades_brutas = f_atividades.result()
        cff = f_cff.result()

        def opcional(futuro, rotulo, padrao):
            try:
                return futuro.result()
            except Exception as e:  # noqa: BLE001 - qualquer falha de um bloco acessorio vira aviso
                avisos.append(f"{rotulo}: {type(e).__name__}")
                return padrao

        produtividade_bruta = opcional(f_prod, "produtividade", [])
        medicoes_brutas = opcional(f_med, "medicoes", [])
        orcamentos = opcional(f_orc, "orcamentos", [])
        semanas = [opcional(f, "ppc semanal", None) for f in f_semanas]
        ppc_aderencia_4s = opcional(f_4s, "ppc 4 semanas", None)

        recentes = sorted(medicoes_brutas, key=lambda m: str(m["measured_in"]), reverse=True)[:MEDICOES_PARA_CAUSAS]
        f_detalhes = [ex.submit(c.detalhe_medicao, pid, m["id"]) for m in recentes]
        lotes = [opcional(f, "detalhe de medicao", []) for f in f_detalhes]

    avanco = calculos.avanco_fisico(atividades_brutas, ref)
    curva, mensal = calculos.curva_s_e_mensal(cff)
    pacotes = calculos.pacotes(cff)
    compactas = calculos.compactar_atividades(atividades_brutas, ref)

    serie = []
    for (ini, fim), valor in zip(janelas, semanas):
        if valor is not None:
            serie.append({"fim": fim.isoformat(), "ppc": valor[0], "aderencia": valor[1]})
    com_plano = [s for s in serie if s["ppc"] > 0 or s["aderencia"] > 0]

    resumo = {
        "id": pid,
        "nome": nome,
        "referencia": ref.isoformat(),
        "avanco": avanco,
        "status": calculos.status_obra(avanco),
        "curva_s": curva,
        "mensal": mensal,
        "pacotes": pacotes,
        "custo_orcado": round(sum(p["custo_orcado"] for p in pacotes), 2),
        "orcamentos": [{"id": o["id"], "nome": o["name"]} for o in orcamentos],
        "servicos": calculos.por_servico(compactas),
        "pavimentos": calculos.por_pavimento(compactas),
        "lean": {
            "semanal": serie,
            "ppc_4s": ppc_aderencia_4s[0] if ppc_aderencia_4s else None,
            "aderencia_4s": ppc_aderencia_4s[1] if ppc_aderencia_4s else None,
            "semanas_com_plano": len(com_plano),
            "causas": calculos.causas_atraso(lotes),
        },
        "produtividade": calculos.produtividade(produtividade_bruta),
        "medicoes": calculos.medicoes(medicoes_brutas, ref),
        "avisos": avisos,
    }
    detalhe = {
        "atividades": compactas,
        "arvore": calculos.arvore(cff),
        "mapa": calculos.mapa_avanco(compactas),
    }
    return resumo, detalhe


# ----------------------------------------------------------------- persistencia


def _gravar(db: Session, pid: int, nome: str, resumo: dict, detalhe: dict) -> None:
    agora = datetime.now()
    linha = db.get(ObraCache, pid)
    if linha is None:
        db.add(ObraCache(prevision_id=pid, nome=nome, atualizado_em=agora, resumo=resumo, detalhe=detalhe))
    else:
        linha.nome, linha.atualizado_em, linha.resumo, linha.detalhe = nome, agora, resumo, detalhe

    av, lean = resumo["avanco"], resumo["lean"]
    hoje = date.today()
    snap = db.scalar(select(Snapshot).where(Snapshot.prevision_id == pid, Snapshot.data == hoje))
    valores = dict(
        base_pct=av["base_pct"], previsto_pct=av["previsto_pct"], realizado_pct=av["realizado_pct"],
        idp=av["idp"], atraso_dias=av["atraso_dias"], ppc_4s=lean["ppc_4s"], aderencia_4s=lean["aderencia_4s"],
        atividades_vencidas=av["atividades_vencidas"],
    )
    if snap is None:
        db.add(Snapshot(prevision_id=pid, data=hoje, **valores))
    else:
        for k, v in valores.items():
            setattr(snap, k, v)
    db.commit()


def atualizar_obra(pid: int, nome: str) -> None:
    resumo, detalhe = construir_obra(pid, nome)
    with SessionLocal() as db:
        _gravar(db, pid, nome, resumo, detalhe)


def _rodar(ids: list[int] | None) -> None:
    try:
        obras = PrevisionClient().listar_projetos_obra()
        alvo = [(int(o["id"]), o["name"]) for o in obras if ids is None or int(o["id"]) in ids]
        with _trava:
            _estado.update(total=len(alvo), concluidas=0, em_andamento=[], erros={})

        def uma(par: tuple[int, str]) -> None:
            pid, nome = par
            with _trava:
                _estado["em_andamento"].append(nome)
            try:
                atualizar_obra(pid, nome)
            except Exception as e:  # noqa: BLE001
                with _trava:
                    _estado["erros"][nome] = f"{type(e).__name__}: {str(e)[:160]}"
                traceback.print_exc()
            finally:
                with _trava:
                    _estado["concluidas"] += 1
                    if nome in _estado["em_andamento"]:
                        _estado["em_andamento"].remove(nome)

        with ThreadPoolExecutor(max_workers=3) as ex:
            list(ex.map(uma, alvo))
    except Exception as e:  # noqa: BLE001
        with _trava:
            _estado["erros"]["geral"] = f"{type(e).__name__}: {str(e)[:200]}"
    finally:
        with _trava:
            _estado.update(rodando=False, terminado_em=datetime.now().isoformat(timespec="seconds"), em_andamento=[])


def iniciar_atualizacao(ids: list[int] | None = None) -> bool:
    """Dispara a atualizacao em segundo plano. Devolve False se ja houver uma em curso."""
    with _trava:
        if _estado["rodando"]:
            return False
        _estado.update(rodando=True, iniciado_em=datetime.now().isoformat(timespec="seconds"),
                       terminado_em=None, total=0, concluidas=0, erros={})
    threading.Thread(target=_rodar, args=(ids,), daemon=True, name="atualizacao-prevision").start()
    return True


def estado_atualizacao() -> dict:
    with _trava:
        return {**_estado, "em_andamento": list(_estado["em_andamento"]), "erros": dict(_estado["erros"])}


def precisa_atualizar(db: Session) -> bool:
    ultima = db.scalar(select(ObraCache.atualizado_em).order_by(ObraCache.atualizado_em.asc()).limit(1))
    if ultima is None:
        return True
    return datetime.now() - ultima > timedelta(hours=settings.cache_ttl_horas)


# ------------------------------------------------------------------- leitura


def parametros(db: Session) -> dict[str, float]:
    valores = dict(PARAMETROS_PADRAO)
    for p in db.scalars(select(Parametro)):
        if p.chave in valores:
            valores[p.chave] = p.valor
    return valores


def _configs(db: Session) -> dict[int, ObraConfig]:
    return {c.prevision_id: c for c in db.scalars(select(ObraConfig))}


def _historico(db: Session) -> dict[int, list[dict]]:
    saida: dict[int, list[dict]] = {}
    for s in db.scalars(select(Snapshot).order_by(Snapshot.data.asc())):
        saida.setdefault(s.prevision_id, []).append({
            "data": s.data.isoformat(), "idp": s.idp, "realizado_pct": s.realizado_pct,
            "ppc_4s": s.ppc_4s, "atraso_dias": s.atraso_dias,
        })
    return saida


def _com_config(resumo: dict, atualizado_em: datetime, cfg: ObraConfig | None, params: dict[str, float]) -> dict:
    return {
        **resumo,
        "atualizado_em": atualizado_em.isoformat(timespec="seconds"),
        "empresa": cfg.empresa if cfg else None,
        "metas": {
            "idp": (cfg.meta_idp if cfg and cfg.meta_idp is not None else params["meta_idp"]),
            "ppc": (cfg.meta_ppc if cfg and cfg.meta_ppc is not None else params["meta_ppc"]),
            "idc": params["meta_idc"],
            "iqo": params["meta_iqo"],
        },
    }


def listar_resumos(db: Session, incluir_historico: bool = False) -> list[dict]:
    params, cfgs = parametros(db), _configs(db)
    historico = _historico(db) if incluir_historico else {}
    saida = []
    for linha in db.scalars(select(ObraCache).order_by(ObraCache.nome)):
        item = _com_config(linha.resumo, linha.atualizado_em, cfgs.get(linha.prevision_id), params)
        if incluir_historico:
            item["historico"] = historico.get(linha.prevision_id, [])
        saida.append(item)
    return saida


def obter_resumo(db: Session, pid: int) -> dict | None:
    linha = db.get(ObraCache, pid)
    if linha is None:
        return None
    return _com_config(linha.resumo, linha.atualizado_em, _configs(db).get(pid), parametros(db))


def obter_detalhe(db: Session, pid: int) -> dict | None:
    linha = db.get(ObraCache, pid)
    return linha.detalhe if linha else None
