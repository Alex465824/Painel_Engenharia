/* Follow up de compras, do Mega - mesma grade da tela nativa (R_ADM_Pedido_Compras_Por_DBM.rpt):
   uma linha por ITEM do pedido, não por pedido. Ver backend/app/services/compras_mega.py. */

import { api } from '../api.js';
import { donut, donutLegenda } from '../charts.js';
import {
  brl, brlC, cartao, dataBR, escapar, kpi, ligar, n, opcoesSelect, pendente, tag, vazio,
} from '../ui.js';

/* Confirmado em 2026-10-28 comparando a tela nativa do Mega com o código cru - ver o módulo de serviço. */
const TOM_SITUACAO_ITEM = { PB: 'good', PA: 'neutro', RA: 'serious' };
const POR_PAGINA = 30;
const estado = { situacao: '', busca: '', ordem: 'emissao_desc', pagina: 0 };

function semVinculo(obraNome) {
  return pendente({
    tipo: 'breve',
    rotulo: 'Vínculo com o Mega pendente',
    titulo: 'Esta obra ainda não está ligada a uma filial do Mega',
    corpo: `<p>O follow up de compras precisa saber qual filial do Mega corresponde a <b>${escapar(obraNome)}</b>. Vá em Configurações e clique em
      "Resolver vínculo com o Mega" para tentar achar automaticamente, ou defina manualmente lá.</p>`,
  });
}

function tagSituacaoItem(codigo, rotulo) {
  if (!codigo) return tag('—', 'neutro');
  return tag(rotulo || `${codigo} (a confirmar)`, TOM_SITUACAO_ITEM[codigo] || 'neutro');
}

function linhaPedido(p) {
  return `<tr>
    <td class="num txt-mudo">${n(p.codigo)}</td>
    <td class="txt-mudo">${escapar(p.serie || '—')}</td>
    <td class="txt-mudo">${escapar(p.processo || '—')}</td>
    <td>${tagSituacaoItem(p.situacao_item, p.situacao_item_rotulo)}</td>
    <td>${dataBR(p.emissao)}</td>
    <td class="col-principal">${escapar(p.fornecedor || '—')}<div class="txt-mudo" style="font-size:12px">${n(p.cod_agente)}</div></td>
    <td class="txt-mudo">${escapar(p.cond_pagto || '—')}</td>
    <td class="txt-mudo">${escapar(p.contato || '—')}</td>
    <td><span class="tag tag--contorno">${escapar(p.situacao_pedido || '—')}</span></td>
    <td class="num forte">${brl(p.valor)}</td></tr>`;
}

async function carregar(obraId) {
  const params = new URLSearchParams({ ordem: estado.ordem, pagina: estado.pagina, por_pagina: POR_PAGINA });
  if (estado.situacao) params.set('situacao', estado.situacao);
  if (estado.busca) params.set('busca', estado.busca);
  const [resumo, pedidos] = await Promise.all([
    api.get(`/api/compras/${obraId}/resumo`),
    api.get(`/api/compras/${obraId}/pedidos?${params}`),
  ]);
  return { resumo, pedidos };
}

export async function montar(alvo, ctx) {
  const obra = ctx.obra;
  ctx.cabecalho('Follow up de compras', obra.nome);

  let dados;
  try {
    dados = await carregar(obra.id);
  } catch (erro) {
    if (erro.message.includes('vinculo com o Mega')) {
      alvo.innerHTML = semVinculo(obra.nome);
      return;
    }
    throw erro;
  }
  const { resumo, pedidos } = dados;
  const paginas = Math.max(1, Math.ceil(pedidos.total / POR_PAGINA));

  const situacoes = resumo.por_situacao.map((s) => ({
    rotulo: s.rotulo || `${s.situacao} (a confirmar)`,
    valor: s.qtd,
    cor: { PB: 'var(--status-good)', PA: 'var(--axis)', RA: 'var(--status-serious)' }[s.situacao] || 'var(--series-3)',
  }));

  alvo.innerHTML = `
    <div class="aviso secao"><b>Situação do item:</b> PB (pedido atendido), PA (pedido não atendido) e RA (recusado por alçada) foram confirmados
      comparando ao vivo a tela nativa do Mega com o código cru, em 2026-10-28. PC e AA aparecem na tela nativa mas ainda não têm o rótulo confirmado
      com Suprimentos — por isso aparecem como código cru. A "situação do pedido" (coluna final) é um código à parte, do cabeçalho do pedido.</div>

    <div class="grid grid--kpi secao">
      ${kpi({ rotulo: 'Pedidos', valor: n(resumo.total_pedidos), nota: `${n(resumo.total_itens)} itens` })}
      ${kpi({ rotulo: 'Valor total', valor: brlC(resumo.valor_total), tom: 'info' })}
      ${kpi({ rotulo: 'Fornecedores distintos', valor: n(resumo.fornecedores_distintos) })}
      ${kpi({ rotulo: 'Período', valor: resumo.data_inicio ? `${dataBR(resumo.data_inicio)} – ${dataBR(resumo.data_fim)}` : '—' })}
    </div>

    <div class="grid grid--2 secao">
      ${cartao('Itens por situação', `<div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
        <div id="g-situacao"></div><div style="flex:1;min-width:160px">${donutLegenda(situacoes, resumo.total_itens)}</div></div>`,
        { sub: 'como na tela nativa do Mega (cor e rótulo por item)' })}
      ${cartao('Maiores fornecedores', `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Fornecedor</th><th class="num">Pedidos</th><th class="num">Valor</th></tr></thead>
        <tbody>${resumo.top_fornecedores.map((f) => `<tr><td class="col-principal">${escapar(f.fornecedor || '—')}</td><td class="num">${n(f.qtd)}</td><td class="num forte">${brlC(f.valor_total)}</td></tr>`).join('')
          || '<tr><td colspan="3" class="vazio">Sem fornecedores.</td></tr>'}</tbody></table></div>`, { plano: true })}
    </div>

    <div class="filtros">
      <div class="busca"><input type="search" id="busca" placeholder="Buscar fornecedor…" value="${escapar(estado.busca)}"></div>
      <div class="campo campo--inline"><select id="situacao" aria-label="Situação do item">${opcoesSelect(resumo.por_situacao.map((s) => ({ valor: s.situacao, texto: s.rotulo || s.situacao })), estado.situacao, { vazioRotulo: 'Todas as situações do item' })}</select></div>
      <div class="campo campo--inline"><select id="ordem" aria-label="Ordenar por">${opcoesSelect([
        { valor: 'emissao_desc', texto: 'Emissão: mais recente' },
        { valor: 'emissao_asc', texto: 'Emissão: mais antiga' },
        { valor: 'valor_desc', texto: 'Valor: maior' },
        { valor: 'valor_asc', texto: 'Valor: menor' },
      ], estado.ordem)}</select></div>
    </div>
    ${cartao('Pedidos de compra', `<div class="tabela-wrap"><table class="tabela"><thead><tr>
        <th class="num">Pedido</th><th>Série</th><th>Processo</th><th>Situação do item</th><th>Emissão</th>
        <th>Fornecedor</th><th>Cond.Pagto</th><th>Contato</th><th>Situação</th><th class="num">Valor</th></tr></thead>
        <tbody>${pedidos.pedidos.map(linhaPedido).join('') || '<tr><td colspan="10" class="vazio">Nenhum item com este filtro.</td></tr>'}</tbody></table></div>
      <div class="paginacao"><span>${n(pedidos.total)} itens · página ${estado.pagina + 1} de ${paginas}</span>
        <button class="btn btn--sm" data-pg="-1" ${estado.pagina === 0 ? 'disabled' : ''}>Anterior</button>
        <button class="btn btn--sm" data-pg="1" ${estado.pagina >= paginas - 1 ? 'disabled' : ''}>Próxima</button></div>`)}`;

  if (resumo.total_itens) donut(alvo.querySelector('#g-situacao'), situacoes, { total: resumo.total_itens, rotuloCentro: 'itens' });
  else alvo.querySelector('#g-situacao').innerHTML = vazio('Sem itens');

  alvo.querySelector('#situacao').onchange = (ev) => { estado.situacao = ev.target.value; estado.pagina = 0; montar(alvo, ctx); };
  alvo.querySelector('#ordem').onchange = (ev) => { estado.ordem = ev.target.value; estado.pagina = 0; montar(alvo, ctx); };
  const busca = alvo.querySelector('#busca');
  busca.onchange = () => { estado.busca = busca.value; estado.pagina = 0; montar(alvo, ctx); };
  ligar(alvo, '[data-pg]', 'click', (ev) => { estado.pagina += Number(ev.currentTarget.dataset.pg); montar(alvo, ctx); });
}
