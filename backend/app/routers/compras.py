"""Follow up de pedidos de compra (Mega). Ver services/compras_mega.py para o mapeamento das tabelas."""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.db_models import ObraConfig
from app.services import compras_mega

router = APIRouter(prefix="/api/compras", tags=["compras"])

_TTL_SEGUNDOS = 180  # o Oracle e consultado direto; um cache curtinho evita martelar a cada clique de filtro
_cache: dict[tuple, tuple[float, dict]] = {}


def _com_cache(chave: tuple, construir):
    agora = time.time()
    if chave in _cache and agora - _cache[chave][0] < _TTL_SEGUNDOS:
        return _cache[chave][1]
    valor = construir()
    _cache[chave] = (agora, valor)
    return valor


def _filial_da_obra(obra_id: int, db: Session) -> int:
    cfg = db.get(ObraConfig, obra_id)
    if not cfg or not cfg.mega_fil_in_codigo:
        raise HTTPException(
            409,
            "Esta obra ainda nao tem o vinculo com o Mega resolvido. "
            "Va em Configurações e clique em “Resolver vínculo com o Mega”.",
        )
    return cfg.mega_fil_in_codigo


@router.get("/{obra_id}/resumo")
def resumo(obra_id: int, db: Session = Depends(get_db)):
    fil = _filial_da_obra(obra_id, db)
    try:
        return _com_cache(("resumo", fil), lambda: compras_mega.resumo_pedidos(fil))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Erro ao consultar o Mega: {type(e).__name__}: {str(e)[:200]}") from e


@router.get("/{obra_id}/pedidos")
def pedidos(
    obra_id: int,
    situacao: str | None = None,
    busca: str | None = None,
    ordem: str = Query(default="emissao_desc"),
    pagina: int = Query(default=0, ge=0),
    por_pagina: int = Query(default=30, ge=1, le=200),
    db: Session = Depends(get_db),
):
    fil = _filial_da_obra(obra_id, db)
    if ordem not in compras_mega.ORDENS:
        raise HTTPException(400, f"Ordem invalida. Use uma de: {', '.join(compras_mega.ORDENS)}")
    chave = ("pedidos", fil, situacao, busca, ordem, pagina, por_pagina)
    try:
        return _com_cache(chave, lambda: compras_mega.listar_pedidos(fil, situacao, busca, ordem, pagina, por_pagina))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Erro ao consultar o Mega: {type(e).__name__}: {str(e)[:200]}") from e
