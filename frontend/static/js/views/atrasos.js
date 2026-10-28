/* Atrasos: o que ja venceu, o que esta atras do plano e o que escorregou contra a linha de base. */

import { barrasHorizontais } from '../charts.js';
import { cartao, dataBR, escapar, filtroChips, kpi, ligar, n, pct, barraDupla } from '../ui.js';

const POR_PAGINA = 25;
const estado = { modo: 'vencidas', busca: '', pagina: 0 };
const DIA = 86400000;

export async function montar(alvo, ctx) {
  const [o, det] = await Promise.all([ctx.completa(), ctx.detalhe()]);
  const a = o.avanco;
  ctx.cabecalho('Atrasos', o.nome);

  const agora = Date.now();
  const todas = det.atividades.map((x) => ({
    ...x,
    dias_vencida: x.vencida ? Math.round((agora - new Date(x.fim).getTime()) / DIA) : null,
    folga_plano: x.previsto - x.real,
  }));

  const MODOS = {
    vencidas: { rotulo: 'Vencidas', fn: (x) => x.vencida, ordem: (p, q) => q.dias_vencida - p.dias_vencida,
      dica: 'Atividades cujo prazo já passou e que ainda não chegaram a 100%.' },
    plano: { rotulo: 'Atrás do plano', fn: (x) => x.real < x.previsto - 1, ordem: (p, q) => q.folga_plano - p.folga_plano,
      dica: 'Atividades com avanço real abaixo do previsto para hoje, mesmo que o prazo ainda não tenha vencido.' },
    base: { rotulo: 'Escorregaram da base', fn: (x) => (x.atraso_dias || 0) > 0 && x.real < 100, ordem: (p, q) => q.atraso_dias - p.atraso_dias,
      dica: 'Atividades em aberto cujo término hoje está depois do término na linha de base.' },
  };
  const contagem = Object.fromEntries(Object.entries(MODOS).map(([k, m]) => [k, todas.filter(m.fn).length]));
  const modo = MODOS[estado.modo];
  const filtradas = todas.filter(modo.fn)
    .filter((x) => !estado.busca || `${x.servico} ${x.pavimento}`.toLowerCase().includes(estado.busca.toLowerCase()))
    .sort(modo.ordem);
  const paginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  estado.pagina = Math.min(estado.pagina, paginas - 1);
  const pagina = filtradas.slice(estado.pagina * POR_PAGINA, (estado.pagina + 1) * POR_PAGINA);

  const escorregaram = todas.filter((x) => (x.atraso_dias || 0) > 0);
  const maiorAtraso = escorregaram.length ? Math.max(...escorregaram.map((x) => x.atraso_dias)) : null;
  const total = a.total_atividades || 1;

  const linhas = pagina.map((x) => `<tr>
    <td class="col-principal">${escapar(x.servico)}</td><td>${escapar(x.pavimento)}</td>
    <td>${dataBR(x.fim)}${x.base_fim ? `<div class="cel-obra__sub">base ${dataBR(x.base_fim)}</div>` : '<div class="cel-obra__sub">sem linha de base</div>'}</td>
    <td>${barraDupla(x.real, x.previsto)}</td>
    <td class="num ${x.dias_vencida ? 'txt-crit forte' : 'txt-mudo'}">${x.dias_vencida ? `${n(x.dias_vencida)} d` : '—'}</td>
    <td class="num ${(x.atraso_dias || 0) > 0 ? 'txt-aten forte' : 'txt-mudo'}">${x.atraso_dias === null ? '—' : `${n(x.atraso_dias)} d`}</td></tr>`).join('');

  alvo.innerHTML = `
    <div class="grid grid--kpi secao">
      ${kpi({ rotulo: 'Vencidas', valor: n(a.atividades_vencidas), nota: `${pct((a.atividades_vencidas / total) * 100)} das atividades`, tom: a.atividades_vencidas / total >= 0.15 ? 'critical' : a.atividades_vencidas / total >= 0.05 ? 'warning' : 'good' })}
      ${kpi({ rotulo: 'Atrás do plano', valor: n(a.atividades_atrasadas), nota: 'avanço real abaixo do previsto hoje' })}
      ${kpi({ rotulo: 'Escorregaram da base', valor: n(escorregaram.length), nota: maiorAtraso ? `maior: ${n(maiorAtraso)} dias` : 'nenhuma', tom: escorregaram.length ? 'warning' : 'good' })}
      ${kpi({ rotulo: 'Sem linha de base', valor: n(a.atividades_sem_base), nota: 'atividades criadas depois da base — fora do cálculo de atraso' })}
    </div>

    <div class="grid grid--2 secao">
      ${cartao('Vencidas por serviço', '<div id="g-serv"></div>', { sub: 'top 10' })}
      ${cartao('Vencidas por pavimento', '<div id="g-pav"></div>', { sub: 'top 10' })}
    </div>

    ${filtroChips(Object.entries(MODOS).map(([k, m]) => ({ valor: k, rotulo: m.rotulo, n: contagem[k] })), estado.modo)}
    ${cartao('Atividades', `
      <div class="dica" style="margin-bottom:12px">${modo.dica}</div>
      <div class="filtros"><div class="busca"><input type="search" id="busca" placeholder="Buscar por serviço ou pavimento…" value="${escapar(estado.busca)}"></div></div>
      <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Serviço</th><th>Pavimento</th><th>Prazo</th><th>Avanço</th>
        <th class="num">Vencida há</th><th class="num">vs base</th></tr></thead>
        <tbody>${linhas || '<tr><td colspan="6" class="vazio">Nada para mostrar com este filtro.</td></tr>'}</tbody></table></div>
      <div class="paginacao"><span>${n(filtradas.length)} atividades · página ${estado.pagina + 1} de ${paginas}</span>
        <button class="btn btn--sm" data-pg="-1" ${estado.pagina === 0 ? 'disabled' : ''}>Anterior</button>
        <button class="btn btn--sm" data-pg="1" ${estado.pagina >= paginas - 1 ? 'disabled' : ''}>Próxima</button></div>`)}`;

  const top = (lista) => [...lista].filter((l) => l.vencidas > 0).sort((p, q) => q.vencidas - p.vencidas).slice(0, 10)
    .map((l) => ({ rotulo: l.nome, valor: l.vencidas, cor: 'var(--status-critical)' }));
  barrasHorizontais(alvo.querySelector('#g-serv'), top(o.servicos), { larguraRotulo: 190 });
  barrasHorizontais(alvo.querySelector('#g-pav'), top(o.pavimentos), { larguraRotulo: 190 });

  ligar(alvo, '[data-filtro]', 'click', (ev) => { estado.modo = ev.currentTarget.dataset.filtro; estado.pagina = 0; montar(alvo, ctx); });
  ligar(alvo, '[data-pg]', 'click', (ev) => { estado.pagina += Number(ev.currentTarget.dataset.pg); montar(alvo, ctx); });
  const busca = alvo.querySelector('#busca');
  busca.onchange = () => { estado.busca = busca.value; estado.pagina = 0; montar(alvo, ctx); };
}
