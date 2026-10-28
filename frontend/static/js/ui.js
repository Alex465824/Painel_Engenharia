/* Helpers de DOM, formatacao, etiquetas, modal, gaveta e componentes de leitura. */

export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/* ---------------------------------------------------------------- texto -- */

export function escapar(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function n(v, casas = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
export const pct = (v, casas = 1) => (v === null || v === undefined ? '—' : `${n(v, casas)}%`);
export const brl = (v) => (v === null || v === undefined ? '—' : `R$ ${n(v, 0)}`);
export function brlC(v) {
  if (v === null || v === undefined) return '—';
  if (Math.abs(v) >= 1e6) return `R$ ${n(v / 1e6, 1)} Mi`;
  if (Math.abs(v) >= 1e3) return `R$ ${n(v / 1e3, 0)} mil`;
  return brl(v);
}

export function dataBR(iso) {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
export function dataCurta(iso) {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d} ${MESES_CURTOS[Number(m) - 1]} ${a.slice(2)}`;
}
export function mesRotulo(chave) {
  const [a, m] = chave.split('-');
  return `${MESES_CURTOS[Number(m) - 1]}/${a.slice(2)}`;
}
export const pluralizar = (q, s, p) => `${n(q)} ${q === 1 ? s : p}`;

export function diasTxt(d) {
  if (d === null || d === undefined) return '—';
  if (d === 0) return 'no dia';
  return `${n(Math.abs(d))} d${d < 0 ? ' adiantado' : ''}`;
}

export function tempoRelativo(iso) {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return 'agora há pouco';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  return `há ${Math.round(horas / 24)} dias`;
}

/* ------------------------------------------------------------ etiquetas -- */

export function tag(texto, tom = 'neutro', { ponto = false } = {}) {
  const marca = ponto ? '<span class="tag__ponto"></span>' : '';
  return `<span class="tag tag--${tom}">${marca}${escapar(texto)}</span>`;
}

export const STATUS_OBRA = {
  no_prazo: { rotulo: 'No prazo', tom: 'good' },
  atrasada: { rotulo: 'Atrasada', tom: 'critical' },
  concluida: { rotulo: 'Concluída', tom: 'info' },
  nao_iniciada: { rotulo: 'Não iniciada', tom: 'neutro' },
};
export const tagStatus = (s) => tag((STATUS_OBRA[s] || {}).rotulo || s, (STATUS_OBRA[s] || {}).tom || 'neutro', { ponto: true });

/** Classe de leitura de um indice contra a meta: bom, atencao ou critico. */
export function classeIndice(valor, meta) {
  if (valor === null || valor === undefined) return 'mudo';
  if (valor >= meta) return 'bom';
  if (valor >= meta * 0.85) return 'aten';
  return 'crit';
}
export const corIndice = (valor, meta) => ({
  bom: 'var(--status-good)', aten: 'var(--status-warning)', crit: 'var(--status-critical)', mudo: 'var(--axis)',
}[classeIndice(valor, meta)]);
export const txtIndice = (valor, meta) => `txt-${classeIndice(valor, meta)}`;

/* ------------------------------------------------------- componentes de leitura */

export function kpi({ rotulo, valor, nota, tom = '', clicavel = false, acao = '' }) {
  const attrs = clicavel ? ` role="button" tabindex="0" data-acao="${escapar(acao)}"` : '';
  return `<div class="kpi ${tom ? `kpi--${tom}` : ''} ${clicavel ? 'is-clicavel' : ''}"${attrs}>
    <div class="kpi__faixa"></div>
    <div class="kpi__rotulo">${escapar(rotulo)}</div>
    <div class="kpi__valor">${valor}</div>
    ${nota ? `<div class="kpi__nota">${nota}</div>` : ''}
  </div>`;
}

export function cartao(titulo, corpo, { sub = '', acoes = '', plano = false, classe = '' } = {}) {
  return `<section class="card ${classe}">
    ${titulo ? `<div class="card__head"><div><h3>${titulo}</h3>${sub ? `<p>${sub}</p>` : ''}</div>${acoes}</div>` : ''}
    <div class="card__body ${plano ? 'card__body--flush' : ''}">${corpo}</div>
  </section>`;
}

export function par(rotulo, valor, nota = '', { grande = false, classe = '' } = {}) {
  return `<div class="par"><div class="par__k">${escapar(rotulo)}</div>
    <div class="par__v ${grande ? 'par__v--lg' : ''} ${classe}">${valor}</div>
    ${nota ? `<div class="par__n">${nota}</div>` : ''}</div>`;
}

export function medidor(valor, meta, { max } = {}) {
  const teto = max || (meta ? meta * 1.3 : 100);
  const largura = valor === null || valor === undefined ? 0 : Math.max(0, Math.min(100, (valor / teto) * 100));
  return `<div class="medidor"><span style="width:${largura}%;background:${corIndice(valor, meta)}"></span></div>`;
}

/** Barra de avanco com marcador do previsto. */
export function barraDupla(real, previsto) {
  const r = Math.max(0, Math.min(100, real || 0));
  const p = Math.max(0, Math.min(100, previsto || 0));
  const atras = r < p - 3;
  return `<div class="cel-dupla">
    <div class="cel-dupla__trilho">
      <div class="cel-dupla__fill" style="width:${r}%;background:${atras ? 'var(--status-serious)' : 'var(--series-1)'}"></div>
      <div class="cel-dupla__marca" style="left:calc(${p}% - 1px)"></div>
    </div>
    <div class="cel-dupla__txt">${pct(real)} real · ${pct(previsto)} previsto</div>
  </div>`;
}

/** Base / Previsto / Realizado, no padrao do dashboard fisico do Prevision. */
export function barras3(av) {
  const linhas = [
    ['Base', av.base_pct, 'var(--axis)'],
    ['Previsto', av.previsto_pct, 'var(--series-2)'],
    ['Realizado', av.realizado_pct, 'var(--series-1)'],
  ];
  return `<div class="barras3">${linhas.map(([nome, v, cor]) => `
    <div><div class="barra3__cab"><span>${nome}</span><b>${pct(v, 2)}</b></div>
    <div class="barra3__trilho"><div class="barra3__fill" style="width:${Math.min(v, 100)}%;background:${cor}"></div></div></div>`).join('')}</div>`;
}

export function vazio(mensagem) {
  return `<div class="vazio">${escapar(mensagem)}</div>`;
}
export function spinner() {
  return '<div class="spinner" role="status" aria-label="Carregando"></div>';
}

export function filtroChips(opcoes, ativo, atributo = 'data-filtro') {
  return `<div class="filtros">${opcoes.map((o) => `
    <button type="button" class="chip ${String(o.valor) === String(ativo) ? 'is-ativo' : ''}" ${atributo}="${escapar(o.valor)}">
      ${escapar(o.rotulo)}${o.n !== undefined ? ` <span class="chip__n">${o.n}</span>` : ''}</button>`).join('')}</div>`;
}

/** Bloco "ainda nao disponivel": diz o que falta e quem destrava, sem fingir dado. */
export function pendente({ tipo = 'breve', rotulo, titulo, corpo, itens = [] }) {
  const lista = itens.length
    ? `<div class="checklist">${itens.map((i) => `<div class="checklist__item"><span class="checklist__ponto"></span><span>${i}</span></div>`).join('')}</div>`
    : '';
  return `<div class="pend"><span class="tag tag--${tipo === 'breve' ? 'neutro' : tipo} pend__tag">${escapar(rotulo)}</span>
    <h3>${escapar(titulo)}</h3>${corpo}${lista}</div>`;
}

/* ------------------------------------------------------------ selects ---- */

export function opcoesSelect(lista, selecionado, { vazioRotulo } = {}) {
  const partes = [];
  if (vazioRotulo !== undefined) partes.push(`<option value="">${escapar(vazioRotulo)}</option>`);
  for (const item of lista) {
    const valor = typeof item === 'object' ? item.valor : item;
    const texto = typeof item === 'object' ? item.texto : item;
    const sel = String(valor) === String(selecionado ?? '') ? ' selected' : '';
    partes.push(`<option value="${escapar(valor)}"${sel}>${escapar(texto)}</option>`);
  }
  return partes.join('');
}

export function campo(label, controle, ajuda) {
  return `<div class="campo"><label>${escapar(label)}</label>${controle}${ajuda ? `<span class="ajuda">${escapar(ajuda)}</span>` : ''}</div>`;
}

/* -------------------------------------------------------------- toast ---- */

export function toast(mensagem, tipo = 'ok') {
  const caixa = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${tipo === 'erro' ? 'toast--erro' : ''}`;
  el.textContent = mensagem;
  caixa.appendChild(el);
  setTimeout(() => el.remove(), 4600);
}

/* -------------------------------------------------------------- modal ---- */

let fecharModalAtual = null;

export function abrirModal({ titulo, subtitulo, corpo, confirmar = 'Salvar', largo = false, aoConfirmar }) {
  const backdrop = document.getElementById('modal-backdrop');
  const modal = document.getElementById('modal');
  modal.className = `modal ${largo ? 'modal--lg' : ''}`;
  modal.innerHTML = `
    <form id="modal-form">
      <div class="modal__head"><h2>${escapar(titulo)}</h2>${subtitulo ? `<p>${escapar(subtitulo)}</p>` : ''}</div>
      <div class="modal__body">${corpo}</div>
      <div class="modal__foot">
        <button type="button" class="btn" data-cancelar>Cancelar</button>
        <button type="submit" class="btn btn--primario">${escapar(confirmar)}</button>
      </div>
    </form>`;
  backdrop.hidden = false;

  const fechar = () => {
    backdrop.hidden = true;
    modal.innerHTML = '';
    document.removeEventListener('keydown', aoTeclar);
    fecharModalAtual = null;
  };
  fecharModalAtual = fechar;
  function aoTeclar(ev) { if (ev.key === 'Escape') fechar(); }
  document.addEventListener('keydown', aoTeclar);

  modal.querySelector('[data-cancelar]').onclick = fechar;
  backdrop.onclick = (ev) => { if (ev.target === backdrop) fechar(); };
  modal.querySelector('#modal-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const dados = Object.fromEntries(new FormData(ev.target).entries());
    const botao = modal.querySelector('button[type="submit"]');
    botao.disabled = true;
    try {
      await aoConfirmar(dados, ev.target);
      fechar();
    } catch (erro) {
      toast(erro.message || 'Não foi possível salvar', 'erro');
      botao.disabled = false;
    }
  };
  const primeiro = modal.querySelector('input:not([type=hidden]), select, textarea');
  if (primeiro) primeiro.focus();
  return modal;
}
export function fecharModal() { if (fecharModalAtual) fecharModalAtual(); }

/* ------------------------------------------------------------- gaveta ---- */

function aoTeclarGaveta(ev) { if (ev.key === 'Escape') fecharGaveta(); }

export function abrirGaveta(html) {
  const gaveta = document.getElementById('side-drawer');
  const fundo = document.getElementById('drawer-backdrop');
  gaveta.innerHTML = html;
  gaveta.hidden = false;
  fundo.hidden = false;
  fundo.onclick = fecharGaveta;
  document.addEventListener('keydown', aoTeclarGaveta);
  const fechador = gaveta.querySelector('[data-fechar-gaveta]');
  if (fechador) fechador.onclick = fecharGaveta;
  return gaveta;
}

export function fecharGaveta() {
  const gaveta = document.getElementById('side-drawer');
  const alertas = document.getElementById('alert-drawer');
  gaveta.hidden = true;
  gaveta.innerHTML = '';
  alertas.hidden = true;
  document.getElementById('drawer-backdrop').hidden = true;
  document.removeEventListener('keydown', aoTeclarGaveta);
}

export const confirmar = (mensagem) => window.confirm(mensagem);

export function ligar(raiz, seletor, evento, handler) {
  raiz.querySelectorAll(seletor).forEach((el) => el.addEventListener(evento, handler));
}
