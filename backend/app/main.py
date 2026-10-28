"""Painel de Engenharia - aplicacao FastAPI.

Serve a API em /api e o frontend estatico na raiz, em um unico processo:

    uvicorn app.main:app --host 0.0.0.0 --port 8090
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import db_models  # noqa: F401  (registra as tabelas no metadata)
from .config import FRONTEND_DIR, settings
from .database import Base, SessionLocal, engine
from .routers import admin, compras, obras, realizado, restricoes
from .services import engine as motor


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        if motor.precisa_atualizar(db):
            motor.iniciar_atualizacao()
    yield


app = FastAPI(
    title="Painel de Engenharia",
    description="Acompanhamento de obras do Grupo Gadens: Prevision, Mega e planilhas.",
    version="2.0.0",
    lifespan=lifespan,
)

# O detalhe das obras passa de 400 KB de JSON: comprimido cai para uma fracao disso.
app.add_middleware(GZipMiddleware, minimum_size=1024)

for router in (obras.router, admin.router, restricoes.router, compras.router, realizado.router):
    app.include_router(router)


@app.middleware("http")
async def revalidar_estaticos(request, call_next):
    """Faz o navegador revalidar o front a cada carga: sem isso uma atualizacao no servidor
    nao chega a quem ja abriu a pagina (continuaria servindo JS/CSS antigo do cache)."""
    resposta = await call_next(request)
    if request.url.path.startswith("/static") or request.url.path == "/":
        resposta.headers["Cache-Control"] = "no-cache, must-revalidate"
    return resposta


app.mount("/static", StaticFiles(directory=FRONTEND_DIR / "static"), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return FileResponse(FRONTEND_DIR / "static" / "img" / "logo-marca.svg")
