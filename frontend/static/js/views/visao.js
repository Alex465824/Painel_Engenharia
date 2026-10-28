/* Visao geral da obra, no padrao do dashboard fisico do Prevision. */

import { curvaS, legendaCurva } from '../graficos.js';
import { EMPRESAS } from '../menu.js';
import {
  barras3, cartao, classeIndice, dataBR, diasTxt, escapar, kpi, ligar, medidor, n, par, pct, tag, tagStatus, txtIndice,
} from '../ui.js';

const hojeISO = () => new Date().toISOString().slice(0, 10);

export async function montar(alvo, ctx) {
  const [o, det] = await Promise.all([ctx.completa(), ctx.detalhe()]);
  const a = o.avanco;
  const l = o.lean;
  const meses = a.data_inicio && a.data_fim_prevista
    ? Math.round((new Date(a.data_fim_prevista) - new Date(a.data_inicio)) / (1000 * 60 * 60 * 24 * 30.44)) : null;
  const orcamento = o.orcamentos[0] ? o.orcamentos[0].nome : null;
  const empresa = o.empresa ? EMPRESAS[o.empresa].nome : null;

  ctx.cabecalho('Visão geral da obra', o.nome);

  const tomClasse = { bom: 'good', aten: 'warning', crit: 'critical', mudo: '' };
  const comPlano = l.semanas_com_plano > 0 && l.ppc_4s !== null;
  const piores = det.atividades
    .filter((x) => x.vencida)
    .map((x) => ({ ...x, dias: Math.round((Date.now() - new Date(x.fim).getTime()) / 86400000) }))
    .sort((x, y) => y.dias - x.dias).slice(0, 6);

  alvo.innerHTML = `
    <div class="titulo-obra">
      <h2>${escapar(o.nome)}</h2>
      ${tagStatus(o.status)} ${empresa ? tag(empresa, 'marca') : ''}
      <div class="titulo-obra__meta">
        <span>Última medição: <b>${dataBR(o.medicoes.ultima)}</b>${o.medicoes.dias_desde_ultima !== null ? ` (${n(o.medicoes.dias_desde_ultima)} d)` : ''}</span>
        <span>Orçamento: <b>${orcamento ? escapar(orcamento) : 'nenhum cadastrado'}</b></span>
      </div>
    </div>

    <div class="grid grid--3 secao">
      ${cartao('Informações gerais', `
        <div class="pares">
          ${par('Período', dataBR(a.data_inicio), `até ${dataBR(a.data_fim_prevista)}`)}
          ${par('Duração', meses === null ? '—' : `${meses} meses`)}
          ${par('Dias desde o início', n(a.dias_desde_inicio))}
          ${par('Dias para o fim', n(a.dias_para_fim))}
        </div>
        <div class="dica" style="margin-top:14px;border-top:1px solid var(--grid);padding-top:10px">
          Término pela linha de base: <b>${dataBR(a.data_fim_base)}</b>.<br>
          Área, unidades, blocos, engenheiro e coordenador virão do Mega.</div>`)}
      ${cartao('Performance de prazo', `
        <div class="pares">
          ${par('IDP', n(a.idp, 2), `meta ${n(o.metas.idp, 2)}`, { grande: true, classe: txtIndice(a.idp, o.metas.idp) })}
          ${par('Atraso', diasTxt(a.atraso_dias), 'término vs linha de base', { grande: true, classe: (a.atraso_dias || 0) > 0 ? 'txt-crit' : 'txt-bom' })}
        </div>${medidor(a.idp, o.metas.idp)}`)}
      ${cartao('Performance de avanço', `
        <div class="pares">
          ${par('Avanço atual', pct(a.realizado_pct, 2), '', { grande: true })}
          ${par('Previsto', pct(a.previsto_pct, 2), '', { grande: true })}
          ${par('Atividades', `${n(a.atividades_concluidas)} de ${n(a.total_atividades)}`, `${n(a.atividades_atrasadas)} atrás do plano · ${n(a.atividades_vencidas)} vencidas`)}
        </div>`)}
    </div>

    <div class="grid grid--2 secao">
      ${cartao('Avanço físico', barras3(a), { sub: 'ponderado pela duração das atividades' })}
      ${cartao('Pontos de atenção', o.alertas.length
        ? `<div class="atencao-lista">${o.alertas.map((x) => `<button class="atencao atencao--${x.severidade}" data-view="${escapar(x.link.view)}">
            <span class="atencao__barra"></span><span><div class="atencao__titulo">${escapar(x.titulo)}</div>
            <div class="atencao__det">${escapar(x.detalhe)}</div></span></button>`).join('')}</div>`
        : '<div class="vazio">Nenhum ponto de atenção nesta obra.</div>')}
    </div>

    ${cartao('Curva S', `<div id="g-curva"></div>${legendaCurva()}`, { sub: 'avanço acumulado, % do total — linha tracejada marca hoje', classe: 'secao' })}

    <div class="grid grid--kpi secao">
      ${kpi({ rotulo: 'IDP', valor: n(a.idp, 2), nota: `meta ${n(o.metas.idp, 2)} · realizado ÷ base`, tom: tomClasse[classeIndice(a.idp, o.metas.idp)] })}
      ${kpi({ rotulo: 'PPC (4 semanas)', valor: comPlano ? pct(l.ppc_4s, 0) : '—', nota: comPlano ? `meta ${n(o.metas.ppc, 0)}% · <a href="#lean">ver semanal</a>` : 'sem plano de curto prazo na janela', tom: comPlano ? tomClasse[classeIndice(l.ppc_4s, o.metas.ppc)] : '' })}
      ${kpi({ rotulo: 'Aderência (4 sem.)', valor: comPlano ? pct(l.aderencia_4s, 0) : '—', nota: comPlano && l.aderencia_4s > 120 ? 'acima de 100%: plano subdimensionado' : 'executado ÷ planejado de curto prazo' })}
      ${kpi({ rotulo: 'IDC', valor: '—', nota: 'depende do realizado no Mega' })}
      ${kpi({ rotulo: 'IQO', valor: '—', nota: 'fórmula ainda não confirmada' })}
    </div>

    ${cartao('Atividades vencidas há mais tempo', piores.length
      ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Serviço</th><th>Pavimento</th><th>Previsto até</th><th class="num">Real</th><th class="num">Vencida há</th></tr></thead>
        <tbody>${piores.map((x) => `<tr><td class="col-principal">${escapar(x.servico)}</td><td>${escapar(x.pavimento)}</td><td>${dataBR(x.fim)}</td>
        <td class="num">${pct(x.real, 0)}</td><td class="num txt-crit forte">${n(x.dias)} d</td></tr>`).join('')}</tbody></table></div>
        <div class="paginacao"><a href="#atrasos">Ver todas as ${n(a.atividades_vencidas)} atividades vencidas</a></div>`
      : '<div class="vazio">Nenhuma atividade vencida.</div>', { plano: true })}`;

  curvaS(alvo.querySelector('#g-curva'), o.curva_s, { hoje: hojeISO() });
  ligar(alvo, '.atencao', 'click', (ev) => ctx.irPara(ev.currentTarget.dataset.view));
}
