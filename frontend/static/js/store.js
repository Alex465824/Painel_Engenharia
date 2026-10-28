/* Estado compartilhado: empresa e obra escolhidas (lembradas no navegador) e cache dos dados. */

import { api } from './api.js';

const ler = (k) => { try { return localStorage.getItem(`painel-eng:${k}`); } catch { return null; } };
const gravar = (k, v) => {
  try {
    if (v === null || v === undefined) localStorage.removeItem(`painel-eng:${k}`);
    else localStorage.setItem(`painel-eng:${k}`, String(v));
  } catch { /* janela privada: segue sem lembrar */ }
};

export const estado = {
  empresa: ler('empresa'),
  obraId: Number(ler('obra')) || null,
  consolidado: null,
  completas: new Map(),
  detalhes: new Map(),
};

export async function carregarConsolidado(forcar = false) {
  if (!estado.consolidado || forcar) estado.consolidado = await api.get('/api/consolidado');
  return estado.consolidado;
}

export function invalidar() {
  estado.consolidado = null;
  estado.completas.clear();
  estado.detalhes.clear();
}

export function definirEmpresa(empresa) {
  estado.empresa = empresa;
  gravar('empresa', empresa);
}

/** Existe algum vinculo obra -> empresa definido? Enquanto nao houver, as duas empresas veem tudo. */
export const temVinculo = () => (estado.consolidado?.obras || []).some((o) => o.empresa);

export function obrasVisiveis() {
  const todas = estado.consolidado?.obras || [];
  if (!estado.empresa || !temVinculo()) return todas;
  const da_empresa = todas.filter((o) => o.empresa === estado.empresa);
  return da_empresa.length ? da_empresa : [];
}

export function obraSelecionada() {
  const lista = obrasVisiveis();
  const guardada = lista.find((o) => o.id === estado.obraId);
  if (guardada) return guardada;
  // sem escolha previa: abre na obra em execucao que mais precisa de atencao (menor IDP)
  const ativas = lista.filter((o) => ['atrasada', 'no_prazo'].includes(o.status) && o.avanco.idp !== null && o.avanco.realizado_pct > 0);
  ativas.sort((a, b) => a.avanco.idp - b.avanco.idp);
  return ativas[0] || lista[0] || null;
}

export function definirObra(id) {
  estado.obraId = id;
  gravar('obra', id);
}

export async function obraCompleta(id) {
  if (!estado.completas.has(id)) estado.completas.set(id, await api.get(`/api/obras/${id}`));
  return estado.completas.get(id);
}

export async function detalheObra(id) {
  if (!estado.detalhes.has(id)) estado.detalhes.set(id, await api.get(`/api/obras/${id}/detalhe`));
  return estado.detalhes.get(id);
}

export function alertasVisiveis() {
  const ids = new Set(obrasVisiveis().map((o) => o.id));
  return (estado.consolidado?.alertas || []).filter((a) => a.obra_id === null || ids.has(a.obra_id));
}
