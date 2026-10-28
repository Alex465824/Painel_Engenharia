/* Custos: orcamento em arvore (o que o Prevision tem) e o que depende do Mega. */

import { barrasHorizontais } from '../charts.js';
import { brl, brlC, cartao, escapar, kpi, ligar, n, pct, pendente } from '../ui.js';

const abertos = new Set();

function linhaArvore(no, nivel, total) {
  const temFilhos = no.filhos.length > 0;
  const aberto = abertos.has(no.codigo);
  const desvio = no.pct_realizado - no.pct_previsto;
  let html = `<div class="arvore__linha ${nivel === 0 ? 'arvore__linha--n1' : ''}" data-codigo="${escapar(no.codigo)}">
    <div class="arvore__nome" style="padding-left:${nivel * 18}px">
      <button class="arvore__tog ${temFilhos ? '' : 'arvore__tog--vazio'}" data-tog="${escapar(no.codigo)}" aria-label="${aberto ? 'Recolher' : 'Expandir'}">${aberto ? '▾' : '▸'}</button>
      <span class="arvore__cod">${escapar(no.codigo)}</span><span class="txt" title="${escapar(no.descricao)}">${escapar(no.descricao || '—')}</span></div>
    <div class="num">${brl(no.custo_orcado)}</div>
    <div class="num txt-mudo">${total ? pct((no.custo_orcado / total) * 100, 1) : '—'}</div>
    <div class="num">${pct(no.pct_realizado, 0)}</div>
    <div class="num ${desvio < -5 ? 'txt-crit forte' : desvio > 5 ? 'txt-bom' : 'txt-mudo'}">${desvio >= 0 ? '+' : ''}${n(desvio, 0)} p.p.</div></div>`;
  if (temFilhos && aberto) html += no.filhos.map((f) => linhaArvore(f, nivel + 1, total)).join('');
  return html;
}

export async function montar(alvo, ctx) {
  const [o, det] = await Promise.all([ctx.completa(), ctx.detalhe()]);
  ctx.cabecalho('Custos', o.nome);

  const pacotes = o.pacotes.filter((p) => p.custo_orcado > 0);
  const orcamento = o.orcamentos[0] ? o.orcamentos[0].nome : null;
  const total = o.custo_orcado;

  const desenharArvore = () => det.arvore.map((no) => linhaArvore(no, 0, total)).join('');

  alvo.innerHTML = `
    <div class="grid grid--kpi secao">
      ${kpi({ rotulo: 'Orçado (Prevision)', valor: brlC(total), nota: orcamento ? `orçamento: ${escapar(orcamento)}` : 'nenhum orçamento cadastrado', tom: 'info' })}
      ${kpi({ rotulo: 'Realizado', valor: '—', nota: 'depende dos lançamentos do Mega' })}
      ${kpi({ rotulo: 'Tendência', valor: '—', nota: 'projeção de custo final: Mega + planilhas' })}
      ${kpi({ rotulo: 'Pacotes', valor: n(o.pacotes.length), nota: 'itens de nível 1 do orçamento' })}
    </div>

    ${total ? `
    <div class="grid grid--2 secao">
      ${cartao('Orçado por pacote', '<div id="g-pac"></div>', { sub: 'valor do orçamento no Prevision' })}
      ${cartao('Avanço físico dos pacotes', `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Pacote</th><th class="num">Real</th><th class="num">Previsto</th></tr></thead>
        <tbody>${o.pacotes.map((p) => `<tr><td class="col-principal">${escapar(p.descricao || p.codigo)}</td><td class="num">${pct(p.pct_realizado, 0)}</td><td class="num txt-mudo">${pct(p.pct_previsto, 0)}</td></tr>`).join('')}</tbody></table></div>`, { plano: true })}
    </div>

    ${cartao('Orçamento em árvore', `<div class="arvore__scroll"><div class="arvore__linha arvore__linha--cab">
        <div>Item</div><div class="num">Orçado</div><div class="num">% do total</div><div class="num">Avanço</div><div class="num">vs previsto</div></div>
        <div id="arvore">${desenharArvore()}</div></div>`,
      { sub: 'estrutura de orçamento (WBS) do Prevision. O custo de cada nível já agrega seus filhos; o avanço é medido no próprio item', plano: true, classe: 'secao' })}`
      : `<div class="aviso secao">Esta obra não tem orçamento com valores no Prevision, então não há custo para mostrar.</div>`}

    ${cartao('O que a aba Custos do BI atual tem e depende do Mega', `<div class="grid grid--2">
      ${pendente({ tipo: 'mega', rotulo: 'Aguardando Mega', titulo: 'Realizado, comprometido e tendência', corpo: '<p>Realizado e comprometido por item de orçamento, e a projeção de custo final (tendência), com e sem indexação.</p>' })}
      ${pendente({ tipo: 'mega', rotulo: 'Aguardando Mega', titulo: 'Comparativo de orçamentos', corpo: '<p>Três linhas de base convivem no BI: Orçamento Base, Orçamento Aditivado Indexado e Orçamento Construtora, cada uma com orçado, tendência, variação e aditivos aprovados.</p>' })}
      ${pendente({ tipo: 'breve', rotulo: 'Fórmula a confirmar', titulo: 'INCC e indexação', corpo: '<p>INCC Base, INCC Mês e Indexador alimentam as colunas "Realizado INCC" e "Tendência INCC". Preciso da fórmula exata usada pela equipe.</p>' })}
      ${pendente({ tipo: 'breve', rotulo: 'Fórmula a confirmar', titulo: 'Banda e retenção', corpo: '<p>Banda Prevista x Realizada, Taxa Mês, Retenção e Taxas Adm Obra. O mecanismo contratual da "banda" precisa ser explicado antes de replicar.</p>' })}
    </div>`, { sub: 'veja Integrações para o estado da conexão com o Mega' })}`;

  if (total) barrasHorizontais(alvo.querySelector('#g-pac'), pacotes.map((p) => ({ rotulo: p.descricao || p.codigo, valor: p.custo_orcado, cor: 'var(--series-1)' })), { formatar: brlC, larguraRotulo: 170 });

  const arvore = alvo.querySelector('#arvore');
  if (arvore) {
    arvore.onclick = (ev) => {
      const b = ev.target.closest('[data-tog]');
      if (!b) return;
      const cod = b.dataset.tog;
      if (abertos.has(cod)) abertos.delete(cod); else abertos.add(cod);
      arvore.innerHTML = desenharArvore();
    };
  }
}
