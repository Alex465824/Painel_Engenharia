/* Graficos em SVG inline, sem biblioteca externa.
   Regras seguidas: marcas finas, pontas arredondadas de 4px ancoradas na base,
   linhas de 2px, marcadores >= 8px, folga de 2px entre segmentos empilhados,
   grade/eixos recessivos, rotulos diretos seletivos e tooltip no hover. */

import { escapar, mesRotulo } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';

/* ------------------------------------------------------------- tooltip --- */

let caixaTooltip = null;

function tooltip() {
  if (!caixaTooltip) {
    caixaTooltip = document.createElement('div');
    caixaTooltip.className = 'tooltip-gfx';
    caixaTooltip.hidden = true;
    document.body.appendChild(caixaTooltip);
  }
  return caixaTooltip;
}

export function mostrarTooltip(ev, html) {
  const t = tooltip();
  t.innerHTML = html;
  t.hidden = false;
  const margem = 14;
  let x = ev.clientX + margem;
  let y = ev.clientY + margem;
  const r = t.getBoundingClientRect();
  if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - margem;
  if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - margem;
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}

export function esconderTooltip() {
  if (caixaTooltip) caixaTooltip.hidden = true;
}

/** Liga tooltip a um elemento SVG ja inserido no DOM. */
export function comTooltip(el, html) {
  el.addEventListener('mousemove', (ev) => mostrarTooltip(ev, html));
  el.addEventListener('mouseleave', esconderTooltip);
}

export function criar(tag, atributos = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, v);
  return el;
}

export function svgBase(largura, altura, classe = 'gfx') {
  const svg = criar('svg', {
    viewBox: `0 0 ${largura} ${altura}`,
    width: '100%',
    height: altura,
    class: classe,
    role: 'img',
    preserveAspectRatio: 'xMidYMid meet',
  });
  return svg;
}

/* ---------------------------------------------------------------- donut -- */

/**
 * Rosca com total ao centro. `dados`: [{rotulo, valor, cor}].
 * A legenda vem fora do SVG (donutLegenda) para o texto usar tokens de tinta.
 */
export function donut(container, dados, { total, rotuloCentro = 'total', tamanho = 190 } = {}) {
  const itens = dados.filter((d) => d.valor > 0);
  const soma = total !== undefined ? total : itens.reduce((acc, d) => acc + d.valor, 0);
  const svg = svgBase(tamanho, tamanho);
  const raio = tamanho / 2 - 6;
  const espessura = 20;
  const r = raio - espessura / 2;
  const cx = tamanho / 2;
  const cy = tamanho / 2;

  if (soma === 0) {
    svg.appendChild(criar('circle', {
      cx, cy, r, fill: 'none', stroke: 'var(--grid)', 'stroke-width': espessura,
    }));
  } else {
    let anguloAtual = -Math.PI / 2;
    const folga = itens.length > 1 ? 0.02 : 0; // folga de superficie entre fatias
    for (const item of itens) {
      const fracao = item.valor / soma;
      const varredura = fracao * Math.PI * 2;
      const inicio = anguloAtual + folga / 2;
      const fim = anguloAtual + varredura - folga / 2;
      anguloAtual += varredura;
      if (fim <= inicio) continue;

      const x1 = cx + r * Math.cos(inicio);
      const y1 = cy + r * Math.sin(inicio);
      const x2 = cx + r * Math.cos(fim);
      const y2 = cy + r * Math.sin(fim);
      const arcoGrande = fim - inicio > Math.PI ? 1 : 0;

      const caminho = criar('path', {
        d: `M ${x1} ${y1} A ${r} ${r} 0 ${arcoGrande} 1 ${x2} ${y2}`,
        fill: 'none',
        stroke: item.cor,
        'stroke-width': espessura,
        'stroke-linecap': 'butt',
      });
      caminho.style.cursor = 'default';
      svg.appendChild(caminho);
      comTooltip(
        caminho,
        `${escapar(item.rotulo)}<br><b>${item.valor}</b> de ${soma} (${Math.round(fracao * 100)}%)`,
      );
    }
  }

  const numero = criar('text', {
    x: cx, y: cy - 2, 'text-anchor': 'middle',
    style: 'font-size:28px;font-weight:650;fill:var(--text-primary)',
  });
  numero.textContent = soma;
  svg.appendChild(numero);

  const legenda = criar('text', {
    x: cx, y: cy + 17, 'text-anchor': 'middle',
    style: 'font-size:11px;fill:var(--text-muted)',
  });
  legenda.textContent = rotuloCentro;
  svg.appendChild(legenda);

  container.appendChild(svg);
}

export function donutLegenda(dados, total) {
  const soma = total !== undefined ? total : dados.reduce((a, d) => a + d.valor, 0);
  return `<div class="donut-legenda">${dados
    .map((d) => `<div class="donut-legenda__linha">
        <span class="donut-legenda__marca" style="background:${d.cor}"></span>
        <span class="donut-legenda__nome">${escapar(d.rotulo)}</span>
        <span class="donut-legenda__valor">${d.valor}${
          soma ? ` <span style="color:var(--text-muted);font-weight:500">(${Math.round((d.valor / soma) * 100)}%)</span>` : ''
        }</span>
      </div>`)
    .join('')}</div>`;
}

/* ------------------------------------------------------ barras horizontais */

/** Serie unica: magnitude por categoria. Rotulo direto no fim de cada barra. */
export function barrasHorizontais(container, dados, { cor = 'var(--series-1)', alturaBarra = 22, formatar = (v) => v, larguraRotulo: lr = 150 } = {}) {
  if (!dados.length) { container.innerHTML = '<div class="vazio">Sem dados</div>'; return; }

  const larguraRotulo = lr;
  const larguraValor = 56;
  const espaco = 10;
  const largura = 560;
  const altura = dados.length * (alturaBarra + espaco) + 6;
  const maximo = Math.max(...dados.map((d) => d.valor), 1);
  const larguraPlot = largura - larguraRotulo - larguraValor - 12;

  const svg = svgBase(largura, altura);

  dados.forEach((item, i) => {
    const y = i * (alturaBarra + espaco) + 3;
    const w = Math.max((item.valor / maximo) * larguraPlot, item.valor > 0 ? 3 : 0);

    const rotulo = criar('text', {
      x: larguraRotulo - 10, y: y + alturaBarra / 2 + 4,
      'text-anchor': 'end', class: 'gfx__rotulo',
    });
    rotulo.textContent = item.rotulo.length > 24 ? `${item.rotulo.slice(0, 23)}…` : item.rotulo;
    svg.appendChild(rotulo);

    svg.appendChild(criar('rect', {
      x: larguraRotulo, y, width: larguraPlot, height: alturaBarra,
      rx: 4, fill: 'var(--grid)', opacity: '.5',
    }));

    if (w > 0) {
      const barra = criar('rect', {
        x: larguraRotulo, y, width: w, height: alturaBarra,
        rx: 4, fill: item.cor || cor,
      });
      svg.appendChild(barra);
      comTooltip(barra, `${escapar(item.rotulo)}<br><b>${formatar(item.valor)}</b>${item.sufixo || ''}`);
    }

    const valor = criar('text', {
      x: larguraRotulo + larguraPlot + 8, y: y + alturaBarra / 2 + 4, class: 'gfx__valor',
    });
    valor.textContent = formatar(item.valor) + (item.sufixo || '');
    svg.appendChild(valor);
  });

  container.appendChild(svg);
}

/* ------------------------------------------------------ barras empilhadas */

/**
 * Empilhado horizontal. `series`: [{chave, rotulo, cor}].
 * Folga de 2px de superficie entre segmentos, conforme a especificacao de marcas.
 */
export function barrasEmpilhadas(container, dados, series, { alturaBarra = 22 } = {}) {
  if (!dados.length) { container.innerHTML = '<div class="vazio">Sem dados</div>'; return; }

  const larguraRotulo = 150;
  const larguraValor = 38;
  const espaco = 10;
  const largura = 560;
  const altura = dados.length * (alturaBarra + espaco) + 6;
  const totais = dados.map((d) => series.reduce((acc, s) => acc + (d[s.chave] || 0), 0));
  const maximo = Math.max(...totais, 1);
  const larguraPlot = largura - larguraRotulo - larguraValor - 12;

  const svg = svgBase(largura, altura);

  dados.forEach((item, i) => {
    const y = i * (alturaBarra + espaco) + 3;
    let x = larguraRotulo;

    const rotulo = criar('text', {
      x: larguraRotulo - 10, y: y + alturaBarra / 2 + 4,
      'text-anchor': 'end', class: 'gfx__rotulo',
    });
    rotulo.textContent = item.rotulo.length > 24 ? `${item.rotulo.slice(0, 23)}…` : item.rotulo;
    svg.appendChild(rotulo);

    svg.appendChild(criar('rect', {
      x: larguraRotulo, y, width: larguraPlot, height: alturaBarra,
      rx: 4, fill: 'var(--grid)', opacity: '.5',
    }));

    series.forEach((s) => {
      const valor = item[s.chave] || 0;
      if (!valor) return;
      const w = (valor / maximo) * larguraPlot;
      if (w <= 0) return;
      const seg = criar('rect', {
        x, y, width: Math.max(w - 2, 1), height: alturaBarra, rx: 3, fill: s.cor,
      });
      svg.appendChild(seg);
      comTooltip(seg, `${escapar(item.rotulo)}<br>${escapar(s.rotulo)}: <b>${valor}</b>`);
      x += w;
    });

    const total = criar('text', {
      x: larguraRotulo + larguraPlot + 8, y: y + alturaBarra / 2 + 4, class: 'gfx__valor',
    });
    total.textContent = totais[i];
    svg.appendChild(total);
  });

  container.appendChild(svg);
}

export function legenda(series) {
  return `<div class="legenda">${series
    .map((s) => `<span class="legenda__item">
      <span class="legenda__marca" style="background:${s.cor}"></span>${escapar(s.rotulo)}</span>`)
    .join('')}</div>`;
}

/* ----------------------------------------------------------- linhas ------ */

/**
 * Series mensais. `dados`: [{mes, ...valores}], `series`: [{chave, rotulo, cor}].
 * Crosshair vertical + tooltip com todas as series do mes sob o cursor.
 */
export function linhasMensais(container, dados, series, { altura = 220 } = {}) {
  if (!dados.length) { container.innerHTML = '<div class="vazio">Sem dados</div>'; return; }

  const largura = 640;
  const margem = { topo: 14, direita: 14, baixo: 28, esquerda: 34 };
  const larguraPlot = largura - margem.esquerda - margem.direita;
  const alturaPlot = altura - margem.topo - margem.baixo;

  const maximoBruto = Math.max(
    ...dados.flatMap((d) => series.map((s) => d[s.chave] || 0)), 1,
  );
  const passo = maximoBruto <= 5 ? 1 : Math.ceil(maximoBruto / 4);
  const maximo = Math.ceil(maximoBruto / passo) * passo;

  const x = (i) => margem.esquerda + (dados.length === 1 ? larguraPlot / 2 : (i / (dados.length - 1)) * larguraPlot);
  const y = (v) => margem.topo + alturaPlot - (v / maximo) * alturaPlot;

  const svg = svgBase(largura, altura);

  // grade recessiva + eixo Y
  for (let v = 0; v <= maximo; v += passo) {
    svg.appendChild(criar('line', {
      x1: margem.esquerda, x2: largura - margem.direita, y1: y(v), y2: y(v),
      class: v === 0 ? 'gfx__base' : 'gfx__grade',
    }));
    const t = criar('text', {
      x: margem.esquerda - 7, y: y(v) + 3.5, 'text-anchor': 'end', class: 'gfx__eixo',
    });
    t.textContent = v;
    svg.appendChild(t);
  }

  // eixo X: rotula de 2 em 2 para nao colidir
  dados.forEach((d, i) => {
    if (i % 2 !== 0 && i !== dados.length - 1) return;
    const t = criar('text', {
      x: x(i), y: altura - 8, 'text-anchor': 'middle', class: 'gfx__eixo',
    });
    t.textContent = mesRotulo(d.mes);
    svg.appendChild(t);
  });

  // linhas de 2px + marcadores de 8px
  series.forEach((s) => {
    const pontos = dados.map((d, i) => `${x(i)},${y(d[s.chave] || 0)}`).join(' ');
    svg.appendChild(criar('polyline', {
      points: pontos, fill: 'none', stroke: s.cor,
      'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
    dados.forEach((d, i) => {
      svg.appendChild(criar('circle', {
        cx: x(i), cy: y(d[s.chave] || 0), r: 4,
        fill: s.cor, stroke: 'var(--surface-1)', 'stroke-width': 2,
      }));
    });
  });

  // camada de hover: uma faixa por mes, com crosshair
  const crosshair = criar('line', {
    y1: margem.topo, y2: margem.topo + alturaPlot,
    stroke: 'var(--axis)', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: '0',
  });
  svg.appendChild(crosshair);

  const larguraFaixa = larguraPlot / Math.max(dados.length - 1, 1);
  dados.forEach((d, i) => {
    const faixa = criar('rect', {
      x: x(i) - larguraFaixa / 2, y: margem.topo,
      width: larguraFaixa, height: alturaPlot,
      fill: 'transparent',
    });
    faixa.addEventListener('mousemove', (ev) => {
      crosshair.setAttribute('x1', x(i));
      crosshair.setAttribute('x2', x(i));
      crosshair.setAttribute('opacity', '1');
      const linhas = series
        .map((s) => `<span style="color:${s.cor}">&#9632;</span> ${escapar(s.rotulo)}: <b>${d[s.chave] || 0}</b>`)
        .join('<br>');
      mostrarTooltip(ev, `<b>${mesRotulo(d.mes)}</b><br>${linhas}`);
    });
    faixa.addEventListener('mouseleave', () => {
      crosshair.setAttribute('opacity', '0');
      esconderTooltip();
    });
    svg.appendChild(faixa);
  });

  container.appendChild(svg);
}

/* ------------------------------------------------------------- sparkbar -- */

/** Barra unica segmentada, para o farol dos encaminhamentos no topo da tela. */
export function barraFarol(container, segmentos, total) {
  const soma = total || segmentos.reduce((a, s) => a + s.valor, 0);
  if (!soma) { container.innerHTML = '<div class="vazio">Sem encaminhamentos</div>'; return; }

  const largura = 600;
  const altura = 26;
  const svg = svgBase(largura, altura);
  let x = 0;
  segmentos.forEach((s) => {
    if (!s.valor) return;
    const w = (s.valor / soma) * largura;
    const seg = criar('rect', {
      x, y: 0, width: Math.max(w - 2, 1), height: altura, rx: 4, fill: s.cor,
    });
    svg.appendChild(seg);
    comTooltip(seg, `${escapar(s.rotulo)}<br><b>${s.valor}</b> de ${soma} (${Math.round((s.valor / soma) * 100)}%)`);

    if (w > 36) {
      const t = criar('text', {
        x: x + (w - 2) / 2, y: altura / 2 + 4, 'text-anchor': 'middle',
        style: 'font-size:11.5px;font-weight:700;fill:#fff',
      });
      t.textContent = s.valor;
      svg.appendChild(t);
    }
    x += w;
  });
  container.appendChild(svg);
}
