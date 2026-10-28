/* Evolucao fisica: curva S, avanco mensal, pacotes e mapa pavimento x servico. */

import { barrasMensais, curvaS, legendaCurva, legendaMapa, mapaDeCalor } from '../graficos.js';
import { barraDupla, cartao, classeIndice, dataBR, escapar, kpi, ligar, mesRotulo, n, pct, brlC } from '../ui.js';

let aba = 'curva';
const hojeISO = () => new Date().toISOString().slice(0, 10);

const ABAS = [['curva', 'Curva S e avanço mensal'], ['pacotes', 'Pacotes'], ['mapa', 'Mapa de avanço']];

export async function montar(alvo, ctx) {
  const o = await ctx.completa();
  const a = o.avanco;
  ctx.cabecalho('Evolução física', o.nome);

  const cabeca = `
    <div class="grid grid--kpi secao">
      ${kpi({ rotulo: 'Realizado', valor: pct(a.realizado_pct, 2), nota: `${n(a.atividades_concluidas)} de ${n(a.total_atividades)} atividades concluídas`, tom: 'info' })}
      ${kpi({ rotulo: 'Previsto', valor: pct(a.previsto_pct, 2), nota: 'replanejamento atual' })}
      ${kpi({ rotulo: 'Base', valor: pct(a.base_pct, 2), nota: 'linha de base aprovada, hoje' })}
      ${kpi({ rotulo: 'IDP', valor: n(a.idp, 2), nota: `meta ${n(o.metas.idp, 2)} · realizado ÷ base`, tom: { bom: 'good', aten: 'warning', crit: 'critical', mudo: '' }[classeIndice(a.idp, o.metas.idp)] })}
      ${kpi({ rotulo: 'Atraso', valor: a.atraso_dias === null ? '—' : `${n(a.atraso_dias)} d`, nota: 'término vs linha de base', tom: (a.atraso_dias || 0) > 0 ? 'critical' : 'good' })}
    </div>
    <div class="abas">${ABAS.map(([k, r]) => `<button class="aba ${k === aba ? 'is-ativa' : ''}" data-aba="${k}">${r}</button>`).join('')}</div>
    <div id="aba-corpo"></div>`;
  alvo.innerHTML = cabeca;
  const corpo = alvo.querySelector('#aba-corpo');

  if (aba === 'curva') {
    const linhas = o.curva_s.map((c, i) => {
      const m = o.mensal[i];
      const real = c.realizado_pct;
      return `<tr><td class="col-principal">${mesRotulo(c.mes)}</td>
        <td class="num">${pct(m.base_pct, 1)}</td><td class="num">${pct(m.previsto_pct, 1)}</td><td class="num">${m.realizado_pct === null ? '—' : pct(m.realizado_pct, 1)}</td>
        <td class="num">${pct(c.base_pct, 1)}</td><td class="num">${pct(c.previsto_pct, 1)}</td>
        <td class="num forte">${real === null ? '—' : pct(real, 1)}</td></tr>`;
    }).join('');
    corpo.innerHTML = `
      ${cartao('Curva S', `<div id="g-curva"></div>${legendaCurva()}`, { sub: 'avanço acumulado, % do total', classe: 'secao' })}
      ${cartao('Avanço por mês', `<div id="g-mensal"></div>${legendaCurva()}`, { sub: 'quanto da obra cada mês representa (% do total)', classe: 'secao' })}
      ${cartao('Tabela mensal', `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Mês</th>
        <th class="num">Base no mês</th><th class="num">Previsto no mês</th><th class="num">Realizado no mês</th>
        <th class="num">Base acum.</th><th class="num">Previsto acum.</th><th class="num">Realizado acum.</th></tr></thead>
        <tbody>${linhas}</tbody></table></div>`, { plano: true })}`;
    curvaS(corpo.querySelector('#g-curva'), o.curva_s, { hoje: hojeISO() });
    barrasMensais(corpo.querySelector('#g-mensal'), o.mensal);
  } else if (aba === 'pacotes') {
    const total = o.pacotes.reduce((s, p) => s + p.custo_orcado, 0);
    corpo.innerHTML = cartao('Evolução por pacote', o.pacotes.length ? `<div class="tabela-wrap"><table class="tabela">
      <thead><tr><th>Cód.</th><th>Pacote</th><th>Avanço</th><th class="num">Desvio</th><th class="num">Orçado</th><th class="num">% do orçamento</th></tr></thead>
      <tbody>${o.pacotes.map((p) => {
        const d = p.pct_realizado - p.pct_previsto;
        return `<tr><td class="txt-mudo">${escapar(p.codigo)}</td><td class="col-principal">${escapar(p.descricao || '—')}</td>
          <td>${barraDupla(p.pct_realizado, p.pct_previsto)}</td>
          <td class="num forte ${d < -5 ? 'txt-crit' : d > 5 ? 'txt-bom' : 'txt-mudo'}">${d >= 0 ? '+' : ''}${n(d, 1)} p.p.</td>
          <td class="num">${brlC(p.custo_orcado)}</td><td class="num">${total ? pct((p.custo_orcado / total) * 100, 1) : '—'}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<div class="vazio">Nenhum pacote de orçamento lançado para esta obra no Prevision.</div>',
    { plano: true, sub: 'itens de nível 1 do orçamento no Prevision · previsto até a última medição' });
  } else {
    const det = await ctx.detalhe();
    corpo.innerHTML = cartao('Mapa de avanço: pavimento × serviço',
      `<div class="dica" style="margin-bottom:12px">Cada célula é a atividade de um serviço em um pavimento. Ordem cronológica da obra:
        os serviços que começam primeiro ficam à esquerda e os pavimentos mais cedo no topo. Mostra os ${det.mapa.servicos.length} serviços de maior duração.</div>
       <div class="heat-wrap" id="g-mapa"></div>${legendaMapa()}`);
    mapaDeCalor(corpo.querySelector('#g-mapa'), det.mapa);
  }

  ligar(alvo, '[data-aba]', 'click', (ev) => { aba = ev.currentTarget.dataset.aba; montar(alvo, ctx); });
}
