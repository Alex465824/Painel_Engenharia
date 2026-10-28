"""
Conector para o Sistema Prevision (API REST).

Endpoints e schemas foram confirmados lendo o OpenAPI real da API (GET /openapi.json)
e validados com chamadas reais em 2026-10-07 / 2026-10-27.

Autenticacao: Bearer token (JWT) em PREVISION_API_KEY no .env. O token inspecionado tem
`aud: ["construction", "financial"]` e nao traz `exp` visivel. Escopos observados:
  - /construction/*, /construction-schedule/*  -> 200
  - /cost-management/*                          -> 401 (token sem esse escopo)
  - /incorporation/*                            -> 401 (token sem esse escopo)

Dois espacos de ID: o "construction project id" (inteiro) vale para /construction* e
/construction-schedule*; o de /cost-management e um uuid ligado ao primeiro pelo campo
`constructionProjectId` do CostManagementProject.

Concorrencia: o painel monta cada obra com ~15 chamadas. Um semaforo global limita as
chamadas simultaneas (PREVISION_MAX_SIMULTANEAS) porque a API nao documenta limite de taxa.
"""

from __future__ import annotations

import threading
import time

import httpx

from app.config import settings

_RETENTAVEL = {429, 500, 502, 503, 504}
_cliente: httpx.Client | None = None
_trava_cliente = threading.Lock()
_semaforo = threading.BoundedSemaphore(max(1, settings.prevision_max_simultaneas))


def _obter_cliente() -> httpx.Client:
    global _cliente
    with _trava_cliente:
        if _cliente is None:
            if not settings.prevision_api_base_url or not settings.prevision_api_key:
                raise RuntimeError(
                    "Configuracao do Prevision ausente. Preencha PREVISION_API_BASE_URL "
                    "e PREVISION_API_KEY no arquivo .env"
                )
            _cliente = httpx.Client(
                base_url=settings.prevision_api_base_url,
                headers={"Authorization": f"Bearer {settings.prevision_api_key}"},
                timeout=httpx.Timeout(45.0, connect=10.0),
                limits=httpx.Limits(max_connections=16, max_keepalive_connections=8),
            )
        return _cliente


class PrevisionClient:
    """Fachada fina sobre a API. Sem estado: pode ser instanciada a vontade."""

    def _requisitar(self, metodo: str, caminho: str, params: dict | None = None, corpo: dict | None = None):
        cliente = _obter_cliente()
        ultima: Exception | None = None
        for tentativa in range(3):
            try:
                with _semaforo:
                    resp = cliente.request(metodo, caminho, params=params, json=corpo)
                if resp.status_code in _RETENTAVEL and tentativa < 2:
                    time.sleep(0.8 * (tentativa + 1))
                    continue
                resp.raise_for_status()
                return resp.json()
            except (httpx.TransportError, httpx.TimeoutException) as e:
                ultima = e
                if tentativa < 2:
                    time.sleep(0.8 * (tentativa + 1))
                    continue
                raise
        raise ultima  # pragma: no cover

    def _get(self, path: str, params: dict | None = None):
        return self._requisitar("GET", path, params=params)

    def _post(self, path: str, json_body: dict | None = None):
        return self._requisitar("POST", path, corpo=json_body or {})

    # --- Projetos ---

    def listar_projetos_obra(self) -> list[dict]:
        """GET /construction/api/v1/projects -> [{id, name}]"""
        return self._get("/construction/api/v1/projects")["projects"]

    def listar_projetos_custo(self) -> list[dict]:
        """GET /cost-management/api/v1/projects -> 401 com o token atual."""
        return self._get("/cost-management/api/v1/projects")["projects"]

    def listar_projetos_incorporacao(self) -> list[dict]:
        """GET /incorporation/api/v1/projects -> 401 com o token atual."""
        return self._get("/incorporation/api/v1/projects")["projects"]

    # --- Cronograma / avanco ---

    def cronograma_fisico_financeiro(self, project_id: int, report_id: int | None = None) -> list[dict]:
        """
        GET .../dashboards/cff -> rows com `base`/`expected`/`realized` ({mes: fracao}),
        `budget_item` (description, material_cost, labor_cost) e `code` (WBS hierarquica).
        """
        params = {"reportId": report_id} if report_id is not None else None
        return self._get(f"/construction-schedule/api/v1/project/{project_id}/dashboards/cff", params)["rows"]

    def atividades(self, project_id: int) -> list[dict]:
        """GET .../activities -> por servico/pavimento: datas atuais e de linha de base, % real e previsto, custo."""
        return self._get(f"/construction-schedule/api/v1/project/{project_id}/activities")["activities"]

    def orcamentos(self, project_id: int) -> list[dict]:
        """GET .../budget_reports -> [{id, name}]"""
        return self._get(f"/construction-schedule/api/v1/project/{project_id}/budget_reports")["budget_reports"]

    def indicadores_curto_prazo(
        self, project_id: int, start_at: str, end_at: str, dashboard_type: str = "physical"
    ) -> dict:
        """
        GET .../dashboards/short-term/indicators -> {"ppc", "grip", "reference"} como fracao (0-1).
        PPC = Percent Plan Complete (Last Planner). `grip` e a "Aderencia" do BI da Engenharia.
        """
        return self._get(
            f"/construction-schedule/api/v1/project/{project_id}/dashboards/short-term/indicators",
            params={"start_at": start_at, "end_at": end_at, "dashboard_type": dashboard_type},
        )

    def produtividade(self, project_id: int) -> list[dict]:
        """GET .../dashboards/productivity -> produtividade base/prevista/realizada por servico."""
        return self._get(f"/construction-schedule/api/v1/project/{project_id}/dashboards/productivity")["productivity"]

    def medicoes(self, project_id: int) -> list[dict]:
        """GET .../measurement_tasks -> [{id, measured_in}]"""
        return self._get(f"/construction-schedule/api/v1/project/{project_id}/measurement_tasks")["measurement_tasks"]

    def detalhe_medicao(self, project_id: int, medicao_id: int) -> list[dict]:
        """GET .../measurement_tasks/{id} -> apontamentos da medicao, com `delay_reasons` (causas de atraso)."""
        return self._get(
            f"/construction-schedule/api/v1/project/{project_id}/measurement_tasks/{medicao_id}"
        )["measurements"]

    def progresso_diario(self, project_id: int, view_type: str = "percentage", dashboard_type: str = "physical") -> dict:
        """GET .../dashboards/daily-progress -> {lastMeasuredIn, progress: [{date, base, expected, realized, goal}]}"""
        return self._get(
            f"/construction-schedule/api/v1/project/{project_id}/dashboards/daily-progress",
            params={"view_type": view_type, "dashboard_type": dashboard_type},
        )

    # --- Projecao de custo (cost-management) - exige escopo que o token atual nao tem ---

    def versoes_custo(self, cost_project_id: str) -> list[dict]:
        return self._get(f"/cost-management/api/v1/project/{cost_project_id}/versions")

    def tabela_tendencia(self, cost_project_id: str, version_id: str) -> dict:
        """POST .../trend-table -> custo por unidade construtiva com `trendValue` (projecao do Prevision)."""
        return self._post(f"/cost-management/api/v1/project/{cost_project_id}/version/{version_id}/trend-table")
