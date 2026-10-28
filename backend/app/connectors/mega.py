"""
Conector para o Sistema Mega (Oracle).

O banco e acessado externamente atraves de um DATABASE LINK Oracle - segundo o fornecedor,
toda consulta precisa referenciar a tabela como `<schema>.<tabela>@<dblink>`, por exemplo:

    SELECT * FROM GADENS.glo_agentes@GADENS

Schema e dblink vem do .env (MEGA_DB_SCHEMA, MEGA_DB_LINK) - nao ficam fixos no codigo.

RESOLVIDO (2026-10-28): toda consulta pelo database link devolvia `ORA-28267: Invalid
NameSpace Value`. A causa era o modo THIN do driver `oracledb` (padrao, puro Python) - o
logon do link no servidor remoto so funciona em modo THICK, que usa a biblioteca cliente
Oracle (OCI) de verdade. Com `oracledb.init_oracle_client()` apontando para um Oracle
Instant Client instalado (MEGA_ORACLE_CLIENT_DIR no .env), a mesma consulta funciona.

`init_oracle_client()` so pode ser chamado uma vez por processo - `_preparar_cliente()`
cuida disso com uma trava.
"""

from __future__ import annotations

import threading

import oracledb

from app.config import settings

_trava_cliente = threading.Lock()
_cliente_pronto = False


def _preparar_cliente() -> None:
    """Liga o modo thick (uma vez por processo) se MEGA_ORACLE_CLIENT_DIR estiver configurado.

    Sem isso o driver roda em modo thin (puro Python) - funciona para o banco local, mas o
    logon do database link falha com ORA-28267."""
    global _cliente_pronto
    if _cliente_pronto or not settings.mega_oracle_client_dir:
        return
    with _trava_cliente:
        if _cliente_pronto:
            return
        try:
            oracledb.init_oracle_client(lib_dir=settings.mega_oracle_client_dir)
        except oracledb.ProgrammingError as e:
            # "Oracle Client library has already been initialized" - inofensivo (outra
            # thread venceu a corrida) ou libs ja carregadas por outro motivo; nos dois
            # casos o modo thick ja esta ativo, entao seguimos.
            if "already" not in str(e).lower():
                raise
        _cliente_pronto = True


def get_connection() -> oracledb.Connection:
    if not settings.mega_db_host or not settings.mega_db_service_name:
        raise RuntimeError(
            "Configuracao do Mega ausente. Preencha MEGA_DB_HOST, MEGA_DB_SERVICE_NAME, "
            "MEGA_DB_USER e MEGA_DB_PASSWORD no arquivo .env"
        )
    _preparar_cliente()
    dsn = oracledb.makedsn(settings.mega_db_host, settings.mega_db_port, service_name=settings.mega_db_service_name)
    return oracledb.connect(
        user=settings.mega_db_user, password=settings.mega_db_password, dsn=dsn, tcp_connect_timeout=10
    )


def tabela(nome: str) -> str:
    """Formata `<schema>.<tabela>@<dblink>`, exigido pelo acesso externo ao Mega."""
    return f"{settings.mega_db_schema}.{nome}@{settings.mega_db_link}"


def consultar(sql: str, parametros: dict | None = None, limite: int = 5000) -> list[dict]:
    """Executa uma consulta de leitura e devolve linhas como dicionarios."""
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(sql, parametros or {})
        colunas = [c[0].lower() for c in cur.description]
        return [dict(zip(colunas, linha)) for linha in cur.fetchmany(limite)]


def consultar_um(sql: str, parametros: dict | None = None) -> dict | None:
    linhas = consultar(sql, parametros, limite=1)
    return linhas[0] if linhas else None


def testar_conexao() -> dict:
    """Valida host/porta/service_name/credenciais e, em separado, o database link."""
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 FROM DUAL")
        banco_ok = cur.fetchone()[0] == 1

        info = None
        try:
            cur.execute("SELECT db_link, username, host FROM user_db_links WHERE db_link = :l",
                        l=(settings.mega_db_link or "").upper())
            linha = cur.fetchone()
            if linha:
                info = {"nome": linha[0], "usuario_remoto": linha[1], "destino": linha[2]}
        except oracledb.Error:
            pass

        def tenta(sql: str) -> tuple[bool, str | None]:
            try:
                cur.execute(sql)
                cur.fetchone()
                return True, None
            except oracledb.Error as e:
                return False, str(e)

        dual_ok, dual_erro = tenta(f"SELECT 1 FROM DUAL@{settings.mega_db_link}")
        dblink_ok, dblink_erro = tenta(f"SELECT 1 FROM {tabela('glo_agentes')} WHERE ROWNUM <= 1")

    return {
        "conexao_ok": banco_ok, "dblink_ok": dblink_ok, "dblink_erro": dblink_erro,
        "dual_remoto_ok": dual_ok, "dual_remoto_erro": dual_erro, "dblink": info,
        "banco_local": f"{settings.mega_db_host}:{settings.mega_db_port}/{settings.mega_db_service_name}",
        "modo_thick": not oracledb.is_thin_mode(),
    }
