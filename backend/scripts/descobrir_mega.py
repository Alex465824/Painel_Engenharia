"""Descobre no Mega quais tabelas guardam compras, para mapear o follow up de pedidos.

Rodar SO depois que o database link estiver liberado (hoje devolve ORA-28267):

    cd backend
    .venv\\Scripts\\python scripts\\descobrir_mega.py

Le apenas o DICIONARIO de dados (nomes de tabela, colunas, estatistica de linhas). Nao le conteudo
de negocio. Grava `descoberta_mega.json` ao lado, para revisar antes de escrever qualquer SQL.

Os padroes de nome abaixo sao um CHUTE de partida (vocabulario tipico de ERP de construcao); o que
vale e o que o dicionario devolver. Ajuste PADROES se nao achar o que procura.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import oracledb  # noqa: E402

from app.config import settings  # noqa: E402
from app.connectors import mega  # noqa: E402

# Tabela de pedidos de compra informada pelo usuario em 2026-10-28. O prefixo EST_ e do modulo de estoque/suprimentos
# do Mega, entao as tabelas vizinhas (itens, entregas, fornecedor) devem aparecer pelos mesmos prefixos.
TABELA_PEDIDOS = "EST_PEDCOMPRAS"
PADROES = ["EST_PEDCOMPRA", "EST_PED", "EST_ORDEM", "EST_SOLIC", "EST_COTA", "EST_ITEMPED", "EST_ENTREGA",
           "COMPRA", "PEDIDO", "FORNEC", "RECEB"]
LINK = f"@{settings.mega_db_link}" if settings.mega_db_link else ""


def main() -> int:
    dic = f"all_tables{LINK}"
    filtro = " OR ".join(f"table_name LIKE '%{p}%'" for p in PADROES)
    saida: dict = {"schema": settings.mega_db_schema, "tabelas": []}

    with mega.get_connection() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                f"SELECT owner, table_name, num_rows FROM {dic} "
                f"WHERE owner = :o AND ({filtro}) ORDER BY table_name",
                o=settings.mega_db_schema.upper(),
            )
        except oracledb.Error as e:
            print(f"Nao foi possivel ler o dicionario do Mega: {str(e).splitlines()[0]}")
            print("Se for ORA-28267, o database link ainda nao foi liberado pelo suporte do Mega.")
            return 1

        candidatas = cur.fetchall()
        if TABELA_PEDIDOS not in {nome for _, nome, _ in candidatas}:
            print(f"Atencao: {TABELA_PEDIDOS} nao apareceu no schema {settings.mega_db_schema}; confira o nome com o Mega.")
        print(f"{len(candidatas)} tabelas candidatas no schema {settings.mega_db_schema}:")
        for owner, nome, linhas in candidatas:
            cur.execute(
                f"SELECT column_name, data_type FROM all_tab_columns{LINK} "
                "WHERE owner = :o AND table_name = :t ORDER BY column_id",
                o=owner, t=nome,
            )
            colunas = [{"nome": c, "tipo": t} for c, t in cur.fetchall()]
            saida["tabelas"].append({"tabela": nome, "linhas_estimadas": linhas, "colunas": colunas})
            print(f"  {nome:40s} ~{linhas or 0:>10} linhas, {len(colunas)} colunas")

    destino = Path(__file__).with_name("descoberta_mega.json")
    destino.write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nGravado em {destino}. Proximo passo: escolher as tabelas de pedido, item e fornecedor.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
