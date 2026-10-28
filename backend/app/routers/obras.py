from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.services import alertas, engine

router = APIRouter(prefix="/api", tags=["obras"])


def _leve(r: dict) -> dict:
    """Projecao enxuta para o consolidado: sem curva S, atividades, servicos nem produtividade."""
    return {
        "id": r["id"], "nome": r["nome"], "empresa": r.get("empresa"), "status": r["status"],
        "atualizado_em": r["atualizado_em"], "metas": r["metas"],
        "avanco": r["avanco"], "custo_orcado": r["custo_orcado"], "n_orcamentos": len(r["orcamentos"]),
        "lean": {k: r["lean"][k] for k in ("semanal", "ppc_4s", "aderencia_4s", "semanas_com_plano")},
        "medicoes": {k: r["medicoes"][k] for k in ("ultima", "dias_desde_ultima", "intervalo_medio_dias", "total")},
        "historico": r.get("historico", []),
    }


@router.get("/consolidado")
def consolidado(db: Session = Depends(get_db)):
    resumos = engine.listar_resumos(db, incluir_historico=True)
    params = engine.parametros(db)
    return {
        "obras": [_leve(r) for r in resumos],
        "alertas": alertas.todos(resumos, params, settings.cache_ttl_horas),
        "parametros": params,
        "atualizacao": engine.estado_atualizacao(),
    }


@router.get("/obras/{obra_id}")
def obra(obra_id: int, db: Session = Depends(get_db)):
    r = engine.obter_resumo(db, obra_id)
    if r is None:
        raise HTTPException(404, "Obra nao encontrada. Se os dados ainda estao sendo carregados, aguarde a atualizacao.")
    r["alertas"] = alertas.da_obra(r, engine.parametros(db))
    return r


@router.get("/obras/{obra_id}/detalhe")
def detalhe(obra_id: int, db: Session = Depends(get_db)):
    d = engine.obter_detalhe(db, obra_id)
    if d is None:
        raise HTTPException(404, "Obra nao encontrada")
    return d


@router.get("/alertas")
def listar_alertas(db: Session = Depends(get_db)):
    return alertas.todos(engine.listar_resumos(db), engine.parametros(db), settings.cache_ttl_horas)


@router.get("/atualizar/status")
def status_atualizacao():
    return engine.estado_atualizacao()


@router.post("/atualizar", status_code=202)
def atualizar(obra_id: int | None = Query(default=None)):
    iniciou = engine.iniciar_atualizacao([obra_id] if obra_id else None)
    return {"iniciada": iniciou, **engine.estado_atualizacao()}
