"""Realizado (Caixa) do Mega. Ver services/realizado_mega.py para a escolha do orcamento e o aviso sobre o valor bruto."""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.db_models import ObraCache, ObraConfig
from app.services import realizado_mega

router = APIRouter(prefix="/api/realizado", tags=["realizado"])

_TTL_SEGUNDOS = 180
_cache: dict[tuple, tuple[float, dict]] = {}


def _com_cache(chave: tuple, construir):
    agora = time.time()
    if chave in _cache and agora - _cache[chave][0] < _TTL_SEGUNDOS:
        return _cache[chave][1]
    valor = construir()
    _cache[chave] = (agora, valor)
    return valor


@router.get("/{obra_id}")
def resumo(obra_id: int, db: Session = Depends(get_db)):
    obra = db.get(ObraCache, obra_id)
    if obra is None:
        raise HTTPException(404, "Obra nao encontrada")

    # a filial do Mega so e conhecida via ObraConfig (ver routers/admin.py); reaproveita o mesmo vinculo do follow up de compras
    cfg = db.get(ObraConfig, obra_id)
    if not cfg or not cfg.mega_fil_in_codigo:
        raise HTTPException(
            409,
            "Esta obra ainda nao tem o vinculo com o Mega resolvido. "
            "Va em Configurações e clique em “Resolver vínculo com o Mega”.",
        )

    try:
        orcamento = _com_cache(("orcamento", obra_id), lambda: realizado_mega.resolver_orcamento(cfg.mega_fil_in_codigo, obra.nome))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Erro ao consultar o Mega: {type(e).__name__}: {str(e)[:200]}") from e

    if orcamento is None:
        raise HTTPException(404, "Nenhum orçamento com o nome desta obra foi encontrado no Mega (módulo ADO).")

    try:
        dados = _com_cache(
            ("resumo", orcamento["orc_in_codigo"], orcamento["orc_in_sequencia"]),
            lambda: realizado_mega.resumo_realizado(orcamento["orc_in_codigo"], orcamento["orc_in_sequencia"]),
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Erro ao consultar o Mega: {type(e).__name__}: {str(e)[:200]}") from e

    return {"orcamento": orcamento, **dados}
