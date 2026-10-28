from __future__ import annotations

import threading
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.connectors import mega
from app.connectors.prevision import PrevisionClient
from app.database import get_db
from app.db_models import ObraCache, ObraConfig, Parametro, Snapshot
from app.services import compras_mega, engine

router = APIRouter(prefix="/api", tags=["administracao"])

EMPRESAS = {"gadens", "makeit"}


# --------------------------------------------------------------------- configuracao


class ObraConfigIn(BaseModel):
    empresa: str | None = None
    meta_idp: float | None = None
    meta_ppc: float | None = None
    observacao: str | None = None
    mega_fil_in_codigo: int | None = None


@router.get("/config")
def ler_config(db: Session = Depends(get_db)):
    cfgs = {c.prevision_id: c for c in db.scalars(select(ObraConfig))}
    obras = []
    for linha in db.scalars(select(ObraCache).order_by(ObraCache.nome)):
        c = cfgs.get(linha.prevision_id)
        obras.append({
            "id": linha.prevision_id, "nome": linha.nome, "status": linha.resumo["status"],
            "empresa": c.empresa if c else None,
            "meta_idp": c.meta_idp if c else None, "meta_ppc": c.meta_ppc if c else None,
            "observacao": c.observacao if c else None,
            "mega_fil_in_codigo": c.mega_fil_in_codigo if c else None,
            "mega_fil_nome": c.mega_fil_nome if c else None,
            "mega_fil_confirmado": bool(c.mega_fil_confirmado) if c else False,
            "atualizado_em": linha.atualizado_em.isoformat(timespec="seconds"),
        })
    historico = db.execute(select(func.count(Snapshot.id), func.min(Snapshot.data), func.max(Snapshot.data))).one()
    return {
        "obras": obras,
        "parametros": engine.parametros(db),
        "parametros_padrao": engine.PARAMETROS_PADRAO,
        "historico": {"registros": historico[0], "desde": historico[1], "ate": historico[2]},
        "cache_ttl_horas": settings.cache_ttl_horas,
    }


@router.put("/config/obras/{obra_id}")
def salvar_obra(obra_id: int, corpo: ObraConfigIn, db: Session = Depends(get_db)):
    if corpo.empresa not in EMPRESAS and corpo.empresa is not None:
        raise HTTPException(400, "Empresa invalida. Use 'gadens', 'makeit' ou vazio.")
    if db.get(ObraCache, obra_id) is None:
        raise HTTPException(404, "Obra nao encontrada")
    c = db.get(ObraConfig, obra_id) or ObraConfig(prevision_id=obra_id)
    c.empresa, c.meta_idp, c.meta_ppc, c.observacao = corpo.empresa, corpo.meta_idp, corpo.meta_ppc, corpo.observacao
    if corpo.mega_fil_in_codigo != c.mega_fil_in_codigo:
        # alteracao manual: marca como confirmado pelo usuario (nao sera sobrescrito pela resolucao automatica)
        c.mega_fil_in_codigo = corpo.mega_fil_in_codigo
        c.mega_fil_confirmado = corpo.mega_fil_in_codigo is not None
        c.mega_fil_resolvido_em = datetime.now() if corpo.mega_fil_in_codigo is not None else None
        c.mega_fil_nome = None
    db.merge(c)
    db.commit()
    return {"ok": True}


@router.post("/config/obras/resolver-mega")
def resolver_mega(somente_nao_resolvidas: bool = True, db: Session = Depends(get_db)):
    """Tenta achar, para cada obra, a filial correspondente no Mega (ver services/compras_mega.py).
    Nao sobrescreve vinculos que o usuario confirmou manualmente."""
    resultado = []
    cfgs = {c.prevision_id: c for c in db.scalars(select(ObraConfig))}
    for linha in db.scalars(select(ObraCache).order_by(ObraCache.nome)):
        c = cfgs.get(linha.prevision_id)
        if c and c.mega_fil_confirmado:
            resultado.append({"obra": linha.nome, "status": "mantido (confirmado manualmente)",
                              "fil_in_codigo": c.mega_fil_in_codigo})
            continue
        if somente_nao_resolvidas and c and c.mega_fil_in_codigo:
            resultado.append({"obra": linha.nome, "status": "ja resolvido", "fil_in_codigo": c.mega_fil_in_codigo})
            continue
        try:
            achado = compras_mega.resolver_filial(linha.nome)
        except Exception as e:  # noqa: BLE001
            resultado.append({"obra": linha.nome, "status": f"erro: {type(e).__name__}: {str(e)[:150]}", "fil_in_codigo": None})
            continue
        if not achado:
            resultado.append({"obra": linha.nome, "status": "nao encontrado no Mega", "fil_in_codigo": None})
            continue
        c = c or ObraConfig(prevision_id=linha.prevision_id)
        c.mega_fil_in_codigo = achado["fil_in_codigo"]
        c.mega_fil_nome = achado["nome_mega"]
        c.mega_fil_resolvido_em = datetime.now()
        db.merge(c)
        resultado.append({"obra": linha.nome, "status": "resolvido", "fil_in_codigo": achado["fil_in_codigo"],
                          "nome_mega": achado["nome_mega"], "pedidos": achado["pedidos"]})
    db.commit()
    return resultado


@router.put("/config/parametros")
def salvar_parametros(corpo: dict[str, float], db: Session = Depends(get_db)):
    desconhecidos = set(corpo) - set(engine.PARAMETROS_PADRAO)
    if desconhecidos:
        raise HTTPException(400, f"Parametros desconhecidos: {', '.join(sorted(desconhecidos))}")
    for chave, valor in corpo.items():
        db.merge(Parametro(chave=chave, valor=float(valor)))
    db.commit()
    return engine.parametros(db)


# ------------------------------------------------------------------------ integracoes

_verificacoes: dict[str, dict] = {}
_trava = threading.Lock()

INTEGRACOES = {
    "prevision_construcao": {
        "nome": "Prevision · Obras e cronograma",
        "alimenta": "Avanço físico, curva S, atividades, pacotes, PPC, produtividade e medições.",
    },
    "prevision_incorporacao": {
        "nome": "Prevision · Incorporação",
        "alimenta": "Tarefas, responsáveis e kanban da fase de incorporação, com atraso contra a linha de base.",
    },
    "prevision_custos": {
        "nome": "Prevision · Gestão de custos",
        "alimenta": "Tabela de tendência de custo e desembolso calculadas pelo próprio Prevision.",
    },
    "mega": {
        "nome": "Mega (Oracle)",
        "alimenta": "Custo realizado, custo por nível, pedidos de compra, contratos e medições.",
    },
}


def _configurado(alvo: str) -> bool:
    if alvo.startswith("prevision"):
        return bool(settings.prevision_api_base_url and settings.prevision_api_key)
    return bool(settings.mega_db_host and settings.mega_db_service_name and settings.mega_db_user)


def _executar(alvo: str) -> dict:
    agora = datetime.now().isoformat(timespec="seconds")
    try:
        if alvo == "prevision_construcao":
            n = len(PrevisionClient().listar_projetos_obra())
            return {"ok": True, "detalhe": f"{n} obras acessíveis", "verificado_em": agora}
        if alvo == "prevision_incorporacao":
            n = len(PrevisionClient().listar_projetos_incorporacao())
            return {"ok": True, "detalhe": f"{n} projetos de incorporação", "verificado_em": agora}
        if alvo == "prevision_custos":
            n = len(PrevisionClient().listar_projetos_custo())
            return {"ok": True, "detalhe": f"{n} projetos de custo", "verificado_em": agora}
        if alvo == "mega":
            r = mega.testar_conexao()
            if r["conexao_ok"] and r["dblink_ok"]:
                return {"ok": True, "detalhe": "Conexão e database link funcionando", "verificado_em": agora}
            if r["conexao_ok"]:
                return {"ok": False, "verificado_em": agora, "parcial": True, "diagnostico": r,
                        "detalhe": "Conexão com o banco abre, mas o database link falha"
                                   + (" (até o DUAL remoto falha: é o logon do link no servidor do Mega)" if not r["dual_remoto_ok"] else "")
                                   + ": " + (r["dblink_erro"] or "").splitlines()[0]}
            return {"ok": False, "detalhe": "Não conectou ao banco", "verificado_em": agora}
    except httpx.HTTPStatusError as e:
        cod = e.response.status_code
        explicacao = {401: "token sem permissão para este módulo", 403: "acesso negado", 404: "módulo não encontrado"}
        return {"ok": False, "codigo": cod, "verificado_em": agora,
                "detalhe": f"HTTP {cod}: {explicacao.get(cod, 'erro na API')}"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "verificado_em": agora, "detalhe": f"{type(e).__name__}: {str(e)[:160]}"}
    raise HTTPException(404, "Integracao desconhecida")


@router.get("/integracoes")
def listar_integracoes():
    with _trava:
        ultimas = dict(_verificacoes)
    return [
        {"chave": k, **v, "configurada": _configurado(k), "ultima_verificacao": ultimas.get(k)}
        for k, v in INTEGRACOES.items()
    ]


@router.post("/integracoes/verificar/{alvo}")
def verificar_integracao(alvo: str):
    if alvo not in INTEGRACOES:
        raise HTTPException(404, "Integracao desconhecida")
    resultado = _executar(alvo)
    with _trava:
        _verificacoes[alvo] = resultado
    return resultado


@router.get("/saude")
def saude(db: Session = Depends(get_db)):
    return {
        "status": "ok",
        "organizacao": settings.organizacao,
        "obras_em_cache": db.scalar(select(func.count(ObraCache.prevision_id))),
        "atualizacao": engine.estado_atualizacao(),
    }
