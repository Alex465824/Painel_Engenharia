/* Consolidado: o painel do gestor. Quem precisa de atencao, comparativo das obras e tendencias. */

import { barrasHorizontais, donut, donutLegenda } from '../charts.js';
import { linhasSemanais, sparkline } from '../graficos.js';
import { EMPRESAS } from '../menu.js';
import { alertasVisiveis, estado, obrasVisiveis, temVinculo } from '../store.js';
import {
  barraDupla, cartao, classeIndice, corIndice, dataBR, escapar, filtroChips, kpi, ligar, n, pct, brlC, tagStatus, tag,
} from '../ui.js';

let filtro = 'todas';

const emExecucao = (o) => ['atrasada', 'no_prazo'].includes(o.status);
const comPlano = (o) => o.lean.semanas_com_plano > 0 && o.lean.ppc_4s !== null;

const FILTROS = [
  ['todas', 'Todas', () => true],
  ['execucao', 'Em execução', emExecucao],
  ['atrasada', 'Atrasadas', (o) => o.status === 'atrasada'],
  ['concluida', 'Concluídas', (o) => o.status === 'concluida'],
  ['nao_iniciada', 'Não iniciadas', (o) => o.status === 'nao_iniciada'],
];

export async function montar(alvo, ctx) {
  const obras = obrasVisiveis();
  const empresa = EMPRESAS[ctx.empresa];
  ctx.cabecalho('Consolidado', `${empresa.nome} · ${obras.length} obras no Prevision`);

  const ativas = obras.filter(emExecucao);
  const peso = ativas.reduce((s, o) => s + o.avanco.total_atividades, 0);
  const avancoMedio = peso ? ativas.reduce((s, o) => s + o.avanco.realizado_pct * o.avanco.total_atividades, 0) / peso : null;
  const idps = ativas.filter((o) => o.avanco.idp !== null);
  const idpMedio = idps.length ? idps.reduce((s, o) => s + o.avanco.idp, 0) / idps.length : null;
  const metaIdp = estado.consolidado.parametros.meta_idp;
  const metaPpc = estado.consolidado.parametros.meta_ppc;
  const plan = obras.filter(comPlano);
  const ppcMedio = plan.length ? plan.reduce((s, o) => s + o.lean.ppc_4s, 0) / plan.length : null;
  const atrasadas = obras.filter((o) => o.status === 'atrasada');
  const alertas = alertasVisiveis();
  const criticos = alertas.filter((a) => a.severidade === 'critico').length;
  const orcado = obras.reduce((s, o) => s + (o.custo_orcado || 0), 0);
  const temTeste = alertas.some((a) => a.tipo === 'orcamento_teste');
  const concluidas = obras.filter((o) => o.status === 'concluida').length;
  const naoIniciadas = obras.filter((o) => o.status === 'nao_iniciada').length;

  const contagem = Object.fromEntries(FILTROS.map(([k, , fn]) => [k, obras.filter(fn).length]));
  const filtrar = FILTROS.find(([k]) => k === filtro)[2];
  const lista = obras.filter(filtrar);

  const aviso = temVinculo() ? '' : `<div class="aviso">As duas empresas estão enxergando as ${obras.length} obras, porque o vínculo obra → empresa
    ainda não foi definido. <a href="#configuracoes">Defina em Configurações</a>.</div>`;

  const donutDados = [
    { rotulo: 'No prazo', valor: obras.filter((o) => o.status === 'no_prazo').length, cor: 'var(--status-good)' },
    { rotulo: 'Atrasadas', valor: atrasadas.length, cor: 'var(--status-critical)' },
    { rotulo: 'Concluídas', valor: concluidas, cor: 'var(--series-1)' },
    { rotulo: 'Não iniciadas', valor: naoIniciadas, cor: 'var(--axis)' },
  ];

  const linhas = lista.map((o) => {
    const a = o.avanco;
    const spark = comPlano(o)
      ? sparkline(o.lean.semanal.map((s) => (s.ppc > 0 || s.aderencia > 0 ? s.ppc : null)), { meta: metaPpc, cor: 'var(--series-1)' })
      : '<span class="txt-mudo">—</span>';
    const atraso = a.atraso_dias;
    return `<tr class="is-clicavel" data-obra="${o.id}">
      <td><div class="cel-obra"><span class="cel-obra__nome">${escapar(o.nome)}</span>
        <span class="cel-obra__sub">${dataBR(a.data_inicio)} → ${dataBR(a.data_fim_prevista)}</span></div></td>
      <td>${tagStatus(o.status)}</td>
      <td>${barraDupla(a.realizado_pct, a.previsto_pct)}</td>
      <td class="num">${pct(a.base_pct)}</td>
      <td class="num forte txt-${classeIndice(a.idp, o.metas.idp)}">${n(a.idp, 2)}</td>
      <td><div style="display:flex;align-items:center;gap:8px"><span class="num forte txt-${classeIndice(o.lean.ppc_4s, o.metas.ppc)}" style="min-width:34px">${comPlano(o) ? pct(o.lean.ppc_4s, 0) : '—'}</span>${spark}</div></td>
      <td class="num ${(atraso || 0) > 0 && o.status !== 'concluida' ? 'txt-crit forte' : 'txt-mudo'}">${atraso === null ? '—' : `${n(atraso)} d`}</td>
      <td class="num ${a.atividades_vencidas ? '' : 'txt-mudo'}">${n(a.atividades_vencidas)}</td>
      <td class="num ${(o.medicoes.dias_desde_ultima || 0) > 21 && emExecucao(o) ? 'txt-crit' : ''}">${o.medicoes.dias_desde_ultima === null ? '—' : `${n(o.medicoes.dias_desde_ultima)} d`}</td>
      <td class="num">${o.custo_orcado ? brlC(o.custo_orcado) : '<span class="txt-mudo">—</span>'}</td>
    </tr>`;
  }).join('');

  const atencao = alertas.filter((a) => a.obra_id !== null).slice(0, 7).map((a) => `
    <button class="atencao atencao--${a.severidade}" data-view="${escapar(a.link.view)}" data-obra="${a.link.obra ?? ''}">
      <span class="atencao__barra"></span><span><div class="atencao__titulo">${escapar(a.titulo)}</div>
      <div class="atencao__det">${escapar(a.detalhe)}</div></span></button>`).join('');

  alvo.innerHTML = `${aviso}
    <div class="grid grid--kpi secao">
      ${kpi({ rotulo: 'Em execução', valor: `${ativas.length} <span style="font-size:15px;color:var(--text-muted);font-weight:500">de ${obras.length}</span>`, nota: `${concluidas} concluída${concluidas === 1 ? '' : 's'} · ${naoIniciadas} não iniciada${naoIniciadas === 1 ? '' : 's'}`, tom: 'info' })}
      ${kpi({ rotulo: 'Com atraso de prazo', valor: n(atrasadas.length), nota: 'término além da linha de base', tom: atrasadas.length ? 'critical' : 'good' })}
      ${kpi({ rotulo: 'Avanço médio', valor: pct(avancoMedio), nota: 'obras em execução, ponderado por atividades' })}
      ${kpi({ rotulo: 'IDP médio', valor: n(idpMedio, 2), nota: `meta ${n(metaIdp, 2)} · obras em execução`, tom: { bom: 'good', aten: 'warning', crit: 'critical', mudo: '' }[classeIndice(idpMedio, metaIdp)] })}
      ${kpi({ rotulo: 'PPC médio (4 sem.)', valor: ppcMedio === null ? '—' : pct(ppcMedio, 0), nota: `${plan.length} obras com plano de curto prazo`, tom: { bom: 'good', aten: 'warning', crit: 'critical', mudo: '' }[classeIndice(ppcMedio, metaPpc)] })}
      ${kpi({ rotulo: 'Alertas críticos', valor: n(criticos), nota: `${alertas.length} no total`, tom: criticos ? 'critical' : 'good' })}
      ${kpi({ rotulo: 'Orçado (Prevision)', valor: brlC(orcado), nota: temTeste ? 'inclui um orçamento de teste (ver alertas)' : 'soma dos orçamentos cadastrados' })}
    </div>

    <div class="grid grid--2 secao">
      ${cartao('Atenção agora', atencao ? `<div class="atencao-lista">${atencao}</div>` : '<div class="vazio">Nenhum alerta. Tudo em dia.</div>', { sub: 'ordenado por gravidade' })}
      ${cartao('Situação das obras', `<div style="display:flex;gap:28px;align-items:center;flex-wrap:wrap"><div id="g-donut"></div><div style="flex:1;min-width:170px">${donutLegenda(donutDados, obras.length)}</div></div>`)}
    </div>

    <div class="secao">
      ${filtroChips(FILTROS.map(([k, r]) => ({ valor: k, rotulo: r, n: contagem[k] })), filtro)}
      ${cartao('Comparativo das obras', `<div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Obra</th><th>Status</th><th>Avanço</th><th class="num">Base</th><th class="num">IDP</th>
        <th>PPC · 8 semanas</th><th class="num">Atraso</th><th class="num" title="Atividades com prazo vencido e abaixo de 100%">Vencidas</th>
        <th class="num">Últ. medição</th><th class="num">Orçado</th></tr></thead>
        <tbody>${linhas || '<tr><td colspan="10" class="vazio">Nenhuma obra neste filtro.</td></tr>'}</tbody></table></div>`,
      { plano: true, sub: 'clique em uma obra para abrir a visão geral dela' })}
    </div>

    <div class="grid grid--3 secao">
      ${cartao('IDP por obra', '<div id="g-idp"></div>', { sub: `meta ${n(metaIdp, 2)} (realizado ÷ base)` })}
      ${cartao('PPC por obra', '<div id="g-ppc"></div>', { sub: `últimas 4 semanas · meta ${n(metaPpc, 0)}%` })}
      ${cartao('Atraso por obra', '<div id="g-atraso"></div>', { sub: 'dias além da linha de base' })}
    </div>

    ${cartao('Evolução do portfólio', '<div id="g-hist"></div>', { sub: 'média das obras em execução, a cada dia em que o painel registra um retrato' })}`;

  donut(alvo.querySelector('#g-donut'), donutDados, { total: obras.length, rotuloCentro: 'obras', tamanho: 168 });
  barrasHorizontais(alvo.querySelector('#g-idp'),
    idps.sort((a, b) => a.avanco.idp - b.avanco.idp).map((o) => ({ rotulo: o.nome, valor: o.avanco.idp, cor: corIndice(o.avanco.idp, o.metas.idp) })),
    { formatar: (v) => n(v, 2), larguraRotulo: 120 });
  barrasHorizontais(alvo.querySelector('#g-ppc'),
    plan.sort((a, b) => a.lean.ppc_4s - b.lean.ppc_4s).map((o) => ({ rotulo: o.nome, valor: o.lean.ppc_4s, sufixo: '%', cor: corIndice(o.lean.ppc_4s, o.metas.ppc) })),
    { formatar: (v) => n(v, 0), larguraRotulo: 120 });
  barrasHorizontais(alvo.querySelector('#g-atraso'),
    obras.filter((o) => (o.avanco.atraso_dias || 0) > 0).sort((a, b) => b.avanco.atraso_dias - a.avanco.atraso_dias)
      .map((o) => ({ rotulo: o.nome, valor: o.avanco.atraso_dias, sufixo: ' d', cor: 'var(--status-critical)' })),
    { formatar: (v) => n(v, 0), larguraRotulo: 120 });

  desenharHistorico(alvo.querySelector('#g-hist'), ativas);

  ligar(alvo, '[data-filtro]', 'click', (ev) => { filtro = ev.currentTarget.dataset.filtro; montar(alvo, ctx); });
  ligar(alvo, 'tr[data-obra]', 'click', (ev) => ctx.irPara('visao', ev.currentTarget.dataset.obra));
  ligar(alvo, '.atencao', 'click', (ev) => ctx.irPara(ev.currentTarget.dataset.view, ev.currentTarget.dataset.obra || null));
}

function desenharHistorico(alvo, ativas) {
  const datas = [...new Set(ativas.flatMap((o) => o.historico.map((h) => h.data)))].sort();
  if (datas.length < 2) {
    const inicio = datas[0] ? dataBR(datas[0]) : 'hoje';
    alvo.innerHTML = `<div class="vazio">O painel passou a registrar um retrato por dia em <b>${inicio}</b>.
      A evolução aparece aqui a partir do segundo dia de registro — o Prevision só informa a situação atual, então
      esse histórico só pode ser construído daqui para frente.</div>`;
    return;
  }
  const media = (campo, data, filtroFn = () => true) => {
    const v = ativas.map((o) => o.historico.find((h) => h.data === data)).filter((h) => h && h[campo] !== null && filtroFn(h)).map((h) => h[campo]);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  linhasSemanais(alvo, datas.map((d) => ({ fim: d, avanco: media('realizado_pct', d), ppc: media('ppc_4s', d, (h) => h.ppc_4s > 0) })),
    [{ chave: 'avanco', rotulo: 'Avanço médio', cor: 'var(--series-1)' }, { chave: 'ppc', rotulo: 'PPC médio', cor: 'var(--series-2)' }],
    { maximo: 100 });
}
