/* Graficos proprios do painel, em SVG inline (sem biblioteca), no mesmo padrao do charts.js:
   marcas finas, linhas de 2px, grade recessiva, tooltip no hover, texto sempre em tinta de texto. */

import { comTooltip, criar, esconderTooltip, mostrarTooltip, svgBase } from './charts.js';
import { dataBR, escapar, mesRotulo, n } from './ui.js';

const COR_BASE = '#898781';
const COR_PREVISTO = 'var(--series-2)';
const COR_REALIZADO = 'var(--series-1)';

const DIA = 86400000;
const tempo = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00`).getTime();

function nice(maximo) {
  if (maximo <= 5) return Math.max(1, Math.ceil(maximo));
  const passo = Math.pow(10, Math.floor(Math.log10(maximo)));
  const f = maximo / passo;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * passo;
}

/* ----------------------------------------------------------------- curva S -- */

/** Base x previsto x realizado acumulados. `hoje` (ISO) desenha a linha de referencia. */
export function curvaS(container, pontos, { altura = 300, hoje = null } = {}) {
  if (!pontos || !pontos.length) { container.innerHTML = '<div class="vazio">Esta obra ainda não tem cronograma físico-financeiro no Prevision.</div>'; return; }
  const W = 860;
  const m = { t: 16, r: 22, b: 30, l: 44 };
  const pw = W - m.l - m.r;
  const ph = altura - m.t - m.b;
  const t0 = tempo(pontos[0].mes);
  const t1 = tempo(pontos[pontos.length - 1].mes);
  const x = (iso) => m.l + (t1 === t0 ? pw / 2 : ((tempo(iso) - t0) / (t1 - t0)) * pw);
  const y = (v) => m.t + ph - (v / 100) * ph;

  const svg = svgBase(W, altura);
  [0, 25, 50, 75, 100].forEach((v) => {
    svg.appendChild(criar('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 0 ? 'gfx__base' : 'gfx__grade' }));
    const t = criar('text', { x: m.l - 8, y: y(v) + 3.5, 'text-anchor': 'end', class: 'gfx__eixo' });
    t.textContent = `${v}%`;
    svg.appendChild(t);
  });

  const passo = Math.max(1, Math.ceil(pontos.length / 11));
  pontos.forEach((p, i) => {
    if (i % passo !== 0 && i !== pontos.length - 1) return;
    const t = criar('text', { x: x(p.mes), y: altura - 9, 'text-anchor': 'middle', class: 'gfx__eixo' });
    t.textContent = mesRotulo(p.mes);
    svg.appendChild(t);
  });

  if (hoje && tempo(hoje) >= t0 && tempo(hoje) <= t1) {
    const xh = x(hoje);
    svg.appendChild(criar('line', { x1: xh, x2: xh, y1: m.t, y2: m.t + ph, stroke: 'var(--status-critical)', 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }));
    const t = criar('text', { x: xh + 5, y: m.t + 10, class: 'gfx__eixo', style: 'fill:var(--status-critical);font-weight:600' });
    t.textContent = 'hoje';
    svg.appendChild(t);
  }

  const serie = (chave, cor) => {
    const pts = pontos.filter((p) => p[chave] !== null && p[chave] !== undefined);
    if (!pts.length) return;
    svg.appendChild(criar('polyline', {
      points: pts.map((p) => `${x(p.mes)},${y(p[chave])}`).join(' '), fill: 'none', stroke: cor,
      'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
    const u = pts[pts.length - 1];
    svg.appendChild(criar('circle', { cx: x(u.mes), cy: y(u[chave]), r: 4.5, fill: cor, stroke: 'var(--surface-1)', 'stroke-width': 2 }));
  };
  serie('base_pct', COR_BASE);
  serie('previsto_pct', COR_PREVISTO);
  serie('realizado_pct', COR_REALIZADO);

  const cross = criar('line', { y1: m.t, y2: m.t + ph, stroke: 'var(--axis)', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: '0' });
  svg.appendChild(cross);
  const larg = pw / Math.max(pontos.length - 1, 1);
  pontos.forEach((p) => {
    const faixa = criar('rect', { x: x(p.mes) - larg / 2, y: m.t, width: larg, height: ph, fill: 'transparent' });
    faixa.addEventListener('mousemove', (ev) => {
      cross.setAttribute('x1', x(p.mes)); cross.setAttribute('x2', x(p.mes)); cross.setAttribute('opacity', '1');
      const linha = (cor, rot, v) => (v === null || v === undefined ? '' : `<span style="color:${cor}">&#9632;</span> ${rot}: <b>${n(v, 1)}%</b><br>`);
      mostrarTooltip(ev, `<b>${mesRotulo(p.mes)}</b><br>${linha(COR_BASE, 'Base', p.base_pct)}${linha(COR_PREVISTO, 'Previsto', p.previsto_pct)}${linha(COR_REALIZADO, 'Realizado', p.realizado_pct)}`.replace(/<br>$/, ''));
    });
    faixa.addEventListener('mouseleave', () => { cross.setAttribute('opacity', '0'); esconderTooltip(); });
    svg.appendChild(faixa);
  });
  container.appendChild(svg);
}

export const legendaCurva = () => `<div class="legenda">
  <span class="legenda__item"><span class="legenda__marca" style="background:${COR_BASE}"></span>Base (linha original)</span>
  <span class="legenda__item"><span class="legenda__marca" style="background:${COR_PREVISTO}"></span>Previsto (replanejado)</span>
  <span class="legenda__item"><span class="legenda__marca" style="background:${COR_REALIZADO}"></span>Realizado</span></div>`;

/* ----------------------------------------------------------- barras mensais -- */

export function barrasMensais(container, dados, { altura = 240 } = {}) {
  if (!dados || !dados.length) { container.innerHTML = '<div class="vazio">Sem dados mensais</div>'; return; }
  const W = 860;
  const m = { t: 12, r: 12, b: 30, l: 40 };
  const pw = W - m.l - m.r;
  const ph = altura - m.t - m.b;
  const series = [['base_pct', COR_BASE], ['previsto_pct', COR_PREVISTO], ['realizado_pct', COR_REALIZADO]];
  const maximo = nice(Math.max(...dados.flatMap((d) => series.map(([k]) => d[k] || 0)), 1));
  const y = (v) => m.t + ph - (v / maximo) * ph;
  const grupo = pw / dados.length;
  const larg = Math.max(3, Math.min(12, (grupo - 6) / 3));

  const svg = svgBase(W, altura);
  for (let i = 0; i <= 4; i += 1) {
    const v = (maximo / 4) * i;
    svg.appendChild(criar('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: i === 0 ? 'gfx__base' : 'gfx__grade' }));
    const t = criar('text', { x: m.l - 7, y: y(v) + 3.5, 'text-anchor': 'end', class: 'gfx__eixo' });
    t.textContent = `${n(v, maximo < 8 ? 1 : 0)}%`;
    svg.appendChild(t);
  }
  const passo = Math.max(1, Math.ceil(dados.length / 12));
  dados.forEach((d, i) => {
    const cx = m.l + grupo * i + grupo / 2;
    if (i % passo === 0) {
      const t = criar('text', { x: cx, y: altura - 9, 'text-anchor': 'middle', class: 'gfx__eixo' });
      t.textContent = mesRotulo(d.mes);
      svg.appendChild(t);
    }
    series.forEach(([k, cor], j) => {
      const v = d[k];
      if (v === null || v === undefined) return;
      const bx = cx - (larg * 3 + 4) / 2 + j * (larg + 2);
      const barra = criar('rect', { x: bx, y: y(v), width: larg, height: Math.max(m.t + ph - y(v), 0), rx: 2, fill: cor });
      svg.appendChild(barra);
    });
    const faixa = criar('rect', { x: m.l + grupo * i, y: m.t, width: grupo, height: ph, fill: 'transparent' });
    comTooltip(faixa, `<b>${mesRotulo(d.mes)}</b><br>Base: <b>${n(d.base_pct, 1)}%</b><br>Previsto: <b>${n(d.previsto_pct, 1)}%</b><br>Realizado: <b>${d.realizado_pct === null ? '—' : `${n(d.realizado_pct, 1)}%`}</b>`);
    svg.appendChild(faixa);
  });
  container.appendChild(svg);
}

/* ---------------------------------------------------------- linhas semanais -- */

/** Series por semana com linha de meta tracejada. `dados`: [{fim, ...}]; valores null quebram a linha. */
export function linhasSemanais(container, dados, series, { altura = 250, meta = null, metaRotulo = 'meta', maximo = null, sufixo = '%' } = {}) {
  if (!dados || !dados.length) { container.innerHTML = '<div class="vazio">Sem dados semanais</div>'; return; }
  const W = 760;
  const m = { t: 16, r: 18, b: 30, l: 44 };
  const pw = W - m.l - m.r;
  const ph = altura - m.t - m.b;
  const teto = maximo || nice(Math.max(...dados.flatMap((d) => series.map((s) => d[s.chave] || 0)), meta || 0, 1));
  const x = (i) => m.l + (dados.length === 1 ? pw / 2 : (i / (dados.length - 1)) * pw);
  const y = (v) => m.t + ph - (Math.min(v, teto) / teto) * ph;
  const curto = (iso) => { const [, mm, dd] = iso.slice(0, 10).split('-'); return `${dd}/${mm}`; };

  const svg = svgBase(W, altura);
  for (let i = 0; i <= 4; i += 1) {
    const v = (teto / 4) * i;
    svg.appendChild(criar('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: i === 0 ? 'gfx__base' : 'gfx__grade' }));
    const t = criar('text', { x: m.l - 7, y: y(v) + 3.5, 'text-anchor': 'end', class: 'gfx__eixo' });
    t.textContent = `${n(v, 0)}${sufixo}`;
    svg.appendChild(t);
  }
  dados.forEach((d, i) => {
    const t = criar('text', { x: x(i), y: altura - 9, 'text-anchor': 'middle', class: 'gfx__eixo' });
    t.textContent = curto(d.fim);
    svg.appendChild(t);
  });
  if (meta !== null) {
    svg.appendChild(criar('line', { x1: m.l, x2: W - m.r, y1: y(meta), y2: y(meta), stroke: 'var(--status-good)', 'stroke-width': 1.4, 'stroke-dasharray': '5 4' }));
    const t = criar('text', { x: W - m.r - 2, y: y(meta) - 5, 'text-anchor': 'end', class: 'gfx__eixo', style: 'fill:#006300;font-weight:600' });
    t.textContent = `${metaRotulo} ${n(meta, 0)}${sufixo}`;
    svg.appendChild(t);
  }
  series.forEach((s) => {
    let trecho = [];
    const fecha = () => {
      if (trecho.length > 1) svg.appendChild(criar('polyline', { points: trecho.join(' '), fill: 'none', stroke: s.cor, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      trecho = [];
    };
    dados.forEach((d, i) => {
      if (d[s.chave] === null || d[s.chave] === undefined) { fecha(); return; }
      trecho.push(`${x(i)},${y(d[s.chave])}`);
    });
    fecha();
    dados.forEach((d, i) => {
      if (d[s.chave] === null || d[s.chave] === undefined) return;
      svg.appendChild(criar('circle', { cx: x(i), cy: y(d[s.chave]), r: 4, fill: s.cor, stroke: 'var(--surface-1)', 'stroke-width': 2 }));
    });
  });
  const cross = criar('line', { y1: m.t, y2: m.t + ph, stroke: 'var(--axis)', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: '0' });
  svg.appendChild(cross);
  const larg = pw / Math.max(dados.length - 1, 1);
  dados.forEach((d, i) => {
    const faixa = criar('rect', { x: x(i) - larg / 2, y: m.t, width: larg, height: ph, fill: 'transparent' });
    faixa.addEventListener('mousemove', (ev) => {
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('opacity', '1');
      const linhas = series.map((s) => `<span style="color:${s.cor}">&#9632;</span> ${escapar(s.rotulo)}: <b>${d[s.chave] === null || d[s.chave] === undefined ? '—' : `${n(d[s.chave], 1)}${sufixo}`}</b>`).join('<br>');
      mostrarTooltip(ev, `<b>Semana até ${dataBR(d.fim)}</b><br>${linhas}`);
    });
    faixa.addEventListener('mouseleave', () => { cross.setAttribute('opacity', '0'); esconderTooltip(); });
    svg.appendChild(faixa);
  });
  container.appendChild(svg);
}

/* ---------------------------------------------------------------- sparkline -- */

/** Devolve uma string SVG pequena. Valores null viram lacuna. */
export function sparkline(valores, { largura = 86, altura = 26, cor = 'var(--series-1)', meta = null } = {}) {
  const validos = valores.filter((v) => v !== null && v !== undefined);
  if (validos.length < 2) return '<span class="txt-mudo" style="font-size:11px">sem série</span>';
  const maximo = Math.max(...validos, meta || 0, 1);
  const x = (i) => 2 + (i / (valores.length - 1)) * (largura - 4);
  const y = (v) => altura - 3 - (v / maximo) * (altura - 6);
  let trecho = [];
  const linhas = [];
  const fecha = () => { if (trecho.length > 1) linhas.push(`<polyline points="${trecho.join(' ')}" fill="none" stroke="${cor}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`); trecho = []; };
  valores.forEach((v, i) => { if (v === null || v === undefined) fecha(); else trecho.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`); });
  fecha();
  const ult = valores.map((v, i) => [v, i]).filter(([v]) => v !== null && v !== undefined).pop();
  const guia = meta !== null ? `<line x1="2" x2="${largura - 2}" y1="${y(meta).toFixed(1)}" y2="${y(meta).toFixed(1)}" stroke="var(--status-good)" stroke-width="1" stroke-dasharray="3 3"/>` : '';
  return `<svg class="spark" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}" role="img" aria-label="Tendência">${guia}${linhas.join('')}<circle cx="${x(ult[1]).toFixed(1)}" cy="${y(ult[0]).toFixed(1)}" r="2.8" fill="${cor}"/></svg>`;
}

/* -------------------------------------------------------------------- Gantt -- */

/**
 * Gantt por linha (servico ou pavimento). Barra clara = periodo atual, preenchimento = % real,
 * traco preto = % previsto, fio cinza embaixo = linha de base.
 * `linhas`: [{nome, inicio, fim, base_inicio, base_fim, real, previsto, n, vencidas}]
 */
export function gantt(container, linhas, { hoje, aoClicar } = {}) {
  if (!linhas.length) { container.innerHTML = '<div class="vazio">Nenhuma linha para mostrar com este filtro.</div>'; return; }
  const rotuloW = 236;
  const larguraLinha = 940;
  const altLinha = 26;
  const altCab = 34;
  const datas = linhas.flatMap((l) => [l.inicio, l.fim, l.base_inicio, l.base_fim]).filter(Boolean).map(tempo);
  if (hoje) datas.push(tempo(hoje));
  const t0 = Math.min(...datas) - 3 * DIA;
  const t1 = Math.max(...datas) + 3 * DIA;
  const x = (iso) => rotuloW + ((tempo(iso) - t0) / (t1 - t0)) * larguraLinha;
  const W = rotuloW + larguraLinha + 16;
  const H = altCab + linhas.length * altLinha + 8;

  const svg = svgBase(W, H);
  svg.setAttribute('width', W);
  svg.style.minWidth = `${W}px`;

  // grade de meses
  const cursor = new Date(t0);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= t1) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-01`;
    if (cursor.getTime() >= t0) {
      const xm = x(iso);
      svg.appendChild(criar('line', { x1: xm, x2: xm, y1: altCab - 6, y2: H, class: 'gfx__grade' }));
      const t = criar('text', { x: xm + 4, y: altCab - 12, class: 'gfx__eixo' });
      t.textContent = mesRotulo(iso);
      svg.appendChild(t);
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  linhas.forEach((l, i) => {
    const yTopo = altCab + i * altLinha;
    const g = criar('g', { class: 'gantt__linha' });
    g.appendChild(criar('rect', { x: 0, y: yTopo, width: W, height: altLinha, fill: i % 2 ? 'rgba(11,11,11,.018)' : 'transparent', class: 'gantt__fundo' }));
    const rot = criar('text', { x: 10, y: yTopo + altLinha / 2 + 4, class: 'gfx__rotulo' });
    rot.textContent = l.nome.length > 34 ? `${l.nome.slice(0, 33)}…` : l.nome;
    g.appendChild(rot);

    if (l.base_inicio && l.base_fim) {
      const bx = x(l.base_inicio);
      g.appendChild(criar('rect', { x: bx, y: yTopo + 18, width: Math.max(x(l.base_fim) - bx, 2), height: 3, rx: 1.5, fill: COR_BASE, opacity: '.7' }));
    }
    if (l.inicio && l.fim) {
      const ix = x(l.inicio);
      const largura = Math.max(x(l.fim) - ix, 3);
      const concluida = l.real >= 99.9;
      const atrasada = !concluida && l.real < l.previsto - 3;
      const cor = concluida ? 'var(--status-good)' : atrasada ? 'var(--status-serious)' : 'var(--series-1)';
      g.appendChild(criar('rect', { x: ix, y: yTopo + 5, width: largura, height: 10, rx: 3, fill: cor, opacity: '.22' }));
      if (l.real > 0) g.appendChild(criar('rect', { x: ix, y: yTopo + 5, width: Math.max((largura * Math.min(l.real, 100)) / 100, 2), height: 10, rx: 3, fill: cor }));
      if (l.previsto > 0 && l.previsto < 100) {
        const px = ix + (largura * l.previsto) / 100;
        g.appendChild(criar('line', { x1: px, x2: px, y1: yTopo + 3, y2: yTopo + 17, stroke: 'var(--text-primary)', 'stroke-width': 1.5 }));
      }
    }
    comTooltip(g, `<b>${escapar(l.nome)}</b><br>${dataBR(l.inicio)} → ${dataBR(l.fim)}<br>`
      + `Base: ${l.base_inicio ? `${dataBR(l.base_inicio)} → ${dataBR(l.base_fim)}` : 'sem linha de base'}<br>`
      + `Real <b>${n(l.real, 1)}%</b> · previsto <b>${n(l.previsto, 1)}%</b><br>`
      + `${l.n} atividade${l.n === 1 ? '' : 's'}${l.vencidas ? ` · <b>${l.vencidas} vencida${l.vencidas === 1 ? '' : 's'}</b>` : ''}`);
    if (aoClicar) g.addEventListener('click', () => aoClicar(l));
    svg.appendChild(g);
  });

  if (hoje) {
    const xh = x(hoje);
    svg.appendChild(criar('line', { x1: xh, x2: xh, y1: altCab - 6, y2: H, stroke: 'var(--status-critical)', 'stroke-width': 1.3, 'stroke-dasharray': '4 3' }));
    const t = criar('text', { x: xh + 4, y: altCab - 1, class: 'gfx__eixo', style: 'fill:var(--status-critical);font-weight:700' });
    t.textContent = 'hoje';
    svg.appendChild(t);
  }
  container.appendChild(svg);
}

/* ------------------------------------------------------------- mapa de calor -- */

const RAMPA = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#184f95'];
const faixa = (v) => (v >= 99.9 ? 4 : v >= 75 ? 3 : v >= 50 ? 2 : v >= 25 ? 1 : 0);

export const legendaMapa = () => `<div class="legenda">
  <span class="legenda__item"><span class="legenda__marca" style="background:#eef0f3;border:1px solid var(--axis)"></span>não iniciado</span>
  ${['1–24%', '25–49%', '50–74%', '75–99%', '100%'].map((r, i) => `<span class="legenda__item"><span class="legenda__marca" style="background:${RAMPA[i]}"></span>${r}</span>`).join('')}
  <span class="legenda__item"><span class="legenda__marca" style="background:var(--status-critical);border-radius:50%"></span>atrás do previsto em 5 p.p. ou mais</span></div>`;

/** Matriz pavimento x servico, na ordem cronologica da obra. `mapa`: {pavimentos, servicos, celulas}. */
export function mapaDeCalor(container, mapa) {
  const { pavimentos, servicos, celulas } = mapa;
  if (!pavimentos.length || !servicos.length) { container.innerHTML = '<div class="vazio">Sem atividades para montar o mapa.</div>'; return; }
  const cel = 20;
  const rotuloW = 168;
  const topo = 168;
  const W = rotuloW + servicos.length * cel + 12;
  const H = topo + pavimentos.length * cel + 8;
  const svg = svgBase(W, H, 'gfx heat');
  svg.setAttribute('width', W);
  svg.style.minWidth = `${W}px`;

  servicos.forEach((s, j) => {
    const t = criar('text', {
      x: rotuloW + j * cel + cel / 2, y: topo - 8, class: 'gfx__rotulo',
      transform: `rotate(-58 ${rotuloW + j * cel + cel / 2} ${topo - 8})`,
    });
    t.textContent = s.length > 30 ? `${s.slice(0, 29)}…` : s;
    svg.appendChild(t);
  });
  pavimentos.forEach((p, i) => {
    const t = criar('text', { x: rotuloW - 8, y: topo + i * cel + cel / 2 + 4, 'text-anchor': 'end', class: 'gfx__rotulo' });
    t.textContent = p.length > 26 ? `${p.slice(0, 25)}…` : p;
    svg.appendChild(t);
    servicos.forEach((s, j) => {
      const v = celulas[`${p}||${s}`];
      if (!v) return;
      const [real, previsto] = v;
      const cx = rotuloW + j * cel;
      const cy = topo + i * cel;
      const r = criar('rect', { x: cx, y: cy, width: cel, height: cel, class: 'heat__cel', fill: real <= 0 ? '#eef0f3' : RAMPA[faixa(real)] });
      comTooltip(r, `<b>${escapar(p)}</b><br>${escapar(s)}<br>Real <b>${n(real, 0)}%</b> · previsto <b>${n(previsto, 0)}%</b>`);
      svg.appendChild(r);
      if (real < 99.9 && real < previsto - 5) {
        svg.appendChild(criar('circle', { cx: cx + cel - 6, cy: cy + 6, r: 2.6, fill: 'var(--status-critical)', 'pointer-events': 'none' }));
      }
    });
  });
  container.appendChild(svg);
}
