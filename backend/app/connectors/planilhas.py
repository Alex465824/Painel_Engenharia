"""
Conector para as planilhas internas de projecao de custos.

Quando voce compartilhar as planilhas reais, o plano e:
1. Colocar os arquivos .xlsx na pasta apontada por PLANILHAS_PROJECAO_DIR
2. Ajustar `_mapear_linha_planilha` para os nomes de colunas/abas reais
3. Se houver formulas complexas (ex: curva S, indices de reajuste),
   decidir se replicamos a formula em Python aqui, ou se lemos o
   valor ja calculado pela planilha (mais simples, mas depende de
   manter o Excel atualizado e a formula nao muda com frequencia).

Por enquanto, este modulo so define o contrato (schema) esperado.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from app.config import settings


def _mapear_linha_planilha(row: pd.Series) -> dict:
    """
    TODO: ajustar nomes de colunas conforme a planilha real.
    Exemplo de contrato esperado:
        obra_id, custo_orcado, custo_realizado_acumulado,
        percentual_fisico_realizado, custo_projetado_final
    """
    return {
        "obra_id": row.get("obra_id"),
        "custo_orcado": row.get("custo_orcado"),
        "custo_realizado_acumulado": row.get("custo_realizado_acumulado"),
        "percentual_fisico_realizado": row.get("percentual_fisico_realizado"),
        "custo_projetado_final": row.get("custo_projetado_final"),
    }


def carregar_projecoes(nome_arquivo: str = "projecao_custos.xlsx") -> list[dict]:
    pasta = Path(settings.planilhas_projecao_dir)
    caminho = pasta / nome_arquivo

    if not caminho.exists():
        raise FileNotFoundError(
            f"Planilha de projecao nao encontrada em {caminho}. "
            "Copie o arquivo real para essa pasta ou ajuste PLANILHAS_PROJECAO_DIR no .env"
        )

    df = pd.read_excel(caminho)
    return [_mapear_linha_planilha(row) for _, row in df.iterrows()]
