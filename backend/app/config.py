"""Configuracao da aplicacao, lida de variaveis de ambiente / arquivo .env."""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent
FRONTEND_DIR = PROJECT_DIR / "frontend"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    organizacao: str = "Grupo Gadens"
    database_url: str = "sqlite:///./data/painel_engenharia.db"

    # Quantas horas um retrato das obras vale antes de ser refeito sozinho na subida do servidor
    cache_ttl_horas: int = 6
    # Teto de chamadas simultaneas ao Prevision (a API nao documenta limite de taxa)
    prevision_max_simultaneas: int = 8

    # Mega roda em Oracle (Service Name = DSN Oracle), acessado externamente
    # atraves de um database link - ver nota em app/connectors/mega.py
    mega_db_host: str = ""
    mega_db_port: int = 1521
    mega_db_service_name: str = ""
    mega_db_user: str = ""
    mega_db_password: str = ""
    mega_db_schema: str = ""
    mega_db_link: str = ""
    # Pasta do Oracle Instant Client (modo thick). Necessario: o logon do database link falha
    # (ORA-28267) no modo thin padrao - ver nota em app/connectors/mega.py.
    mega_oracle_client_dir: str = ""

    prevision_api_base_url: str = ""
    prevision_api_key: str = ""
    prevision_api_user: str = ""
    prevision_api_password: str = ""

    planilhas_projecao_dir: str = "../planilhas"

    @property
    def sqlalchemy_url(self) -> str:
        """Resolve caminhos relativos do SQLite em relacao a pasta backend/."""
        prefix = "sqlite:///"
        if self.database_url.startswith(prefix):
            path = Path(self.database_url[len(prefix):])
            if not path.is_absolute():
                path = BACKEND_DIR / path
            path.parent.mkdir(parents=True, exist_ok=True)
            return f"{prefix}{path}"
        return self.database_url


settings = Settings()
