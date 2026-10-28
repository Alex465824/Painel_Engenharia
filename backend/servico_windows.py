"""Empacota o Painel de Engenharia como um Servico do Windows (via pywin32).

Uso (de dentro do venv, ou pelos scripts em deploy/):
    python servico_windows.py install     # registra o servico
    python servico_windows.py start       # inicia
    python servico_windows.py stop        # para
    python servico_windows.py remove      # desinstala

Nao usa nenhuma ferramenta externa (tipo NSSM) - o proprio pywin32 registra o
processo como servico nativo do Windows, com reinicio automatico configurado
pelos scripts de deploy/ (via `sc.exe failure`).
"""

from __future__ import annotations

import os
import sys

import servicemanager
import win32event
import win32service
import win32serviceutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _preparar_log():
    """Redireciona stdout/stderr para um arquivo - um Servico do Windows nao tem console,
    entao sem isso os logs do uvicorn e da aplicacao simplesmente se perdem."""
    pasta = os.path.join(BASE_DIR, "data", "logs")
    os.makedirs(pasta, exist_ok=True)
    arquivo = open(os.path.join(pasta, "servico.log"), "a", buffering=1, encoding="utf-8")
    sys.stdout = arquivo
    sys.stderr = arquivo
    return arquivo


class PainelEngenhariaService(win32serviceutil.ServiceFramework):
    _svc_name_ = "PainelEngenharia"
    _svc_display_name_ = "Painel de Engenharia (Grupo Gadens)"
    _svc_description_ = "API e frontend do Painel de Engenharia - Prevision, Mega e planilhas internas."

    def __init__(self, args):
        super().__init__(args)
        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
        self.server = None

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        if self.server is not None:
            self.server.should_exit = True
        win32event.SetEvent(self.hWaitStop)

    def SvcDoRun(self):
        servicemanager.LogMsg(
            servicemanager.EVENTLOG_INFORMATION_TYPE, servicemanager.PYS_SERVICE_STARTED,
            (self._svc_name_, ""),
        )
        try:
            self._rodar()
        except Exception:
            servicemanager.LogErrorMsg(f"Painel de Engenharia: falhou ao iniciar - ver backend/data/logs/servico.log")
            raise

    def _rodar(self):
        os.chdir(BASE_DIR)
        sys.path.insert(0, BASE_DIR)
        _preparar_log()

        import uvicorn

        from app.main import app  # noqa: E402  (import depois do sys.path/chdir de proposito)

        porta = int(os.environ.get("PORT") or os.environ.get("PORTA") or "8090")
        config = uvicorn.Config(app, host="0.0.0.0", port=porta, log_level="info")
        self.server = uvicorn.Server(config)
        self.server.run()


if __name__ == "__main__":
    win32serviceutil.HandleCommandLine(PainelEngenhariaService)
