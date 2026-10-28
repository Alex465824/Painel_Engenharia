"""Tabelas persistentes do painel.

O Prevision continua sendo a fonte da verdade de cronograma/avanco. Aqui fica so o
que o Prevision nao guarda ou o que precisa sobreviver a uma reinicializacao:
retrato calculado das obras, vinculo obra->empresa, historico diario e restricoes.
"""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class ObraCache(Base):
    """Ultimo retrato calculado de cada obra: resumo leve + detalhe pesado (atividades, arvore, mapa) em coluna separada."""

    __tablename__ = "obra_cache"

    prevision_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nome: Mapped[str] = mapped_column(String(120))
    atualizado_em: Mapped[datetime] = mapped_column(DateTime)
    resumo: Mapped[dict] = mapped_column(JSON)
    detalhe: Mapped[dict] = mapped_column(JSON)


class ObraConfig(Base):
    """Vinculo obra -> empresa, vinculo obra -> filial do Mega, e metas proprias da obra."""

    __tablename__ = "obra_config"

    prevision_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    empresa: Mapped[str | None] = mapped_column(String(20), nullable=True)  # 'gadens' | 'makeit' | None
    meta_idp: Mapped[float | None] = mapped_column(Float, nullable=True)
    meta_ppc: Mapped[float | None] = mapped_column(Float, nullable=True)
    observacao: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Vinculo com o Mega: cada obra e uma SPE propria (GLO_AGENTES), e o pedido de compra
    # se liga a ela por FIL_IN_CODIGO - ver services/compras_mega.py
    mega_fil_in_codigo: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mega_fil_nome: Mapped[str | None] = mapped_column(String(160), nullable=True)
    mega_fil_resolvido_em: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    mega_fil_confirmado: Mapped[bool] = mapped_column(default=False)  # True = usuario confirmou manualmente


class Parametro(Base):
    """Metas e limiares globais editaveis na tela de configuracoes."""

    __tablename__ = "parametro"

    chave: Mapped[str] = mapped_column(String(60), primary_key=True)
    valor: Mapped[float] = mapped_column(Float)


class Snapshot(Base):
    """Um registro por obra por dia: e daqui que sai a evolucao no tempo (o Prevision so entrega o agora)."""

    __tablename__ = "snapshot"
    __table_args__ = (UniqueConstraint("prevision_id", "data", name="uq_snapshot_obra_dia"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    prevision_id: Mapped[int] = mapped_column(Integer, index=True)
    data: Mapped[date] = mapped_column(Date)
    base_pct: Mapped[float] = mapped_column(Float)
    previsto_pct: Mapped[float] = mapped_column(Float)
    realizado_pct: Mapped[float] = mapped_column(Float)
    idp: Mapped[float | None] = mapped_column(Float, nullable=True)
    atraso_dias: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ppc_4s: Mapped[float | None] = mapped_column(Float, nullable=True)
    aderencia_4s: Mapped[float | None] = mapped_column(Float, nullable=True)
    atividades_vencidas: Mapped[int] = mapped_column(Integer, default=0)


class Restricao(Base):
    """Restricoes de obra. A API do Prevision nao as expoe, entao ficam registradas aqui (cadastro ou importacao)."""

    __tablename__ = "restricao"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    obra_id: Mapped[int] = mapped_column(Integer, index=True)
    descricao: Mapped[str] = mapped_column(Text)
    categoria: Mapped[str | None] = mapped_column(String(80), nullable=True)
    responsavel: Mapped[str | None] = mapped_column(String(120), nullable=True)
    prazo: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="Nao iniciada")  # Nao iniciada | Iniciada | Concluida
    criada_em: Mapped[date] = mapped_column(Date, default=date.today)
    concluida_em: Mapped[date | None] = mapped_column(Date, nullable=True)
    origem: Mapped[str] = mapped_column(String(20), default="manual")  # manual | importacao
    observacao: Mapped[str | None] = mapped_column(Text, nullable=True)
