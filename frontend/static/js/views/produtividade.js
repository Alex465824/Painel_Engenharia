/* Produtividade por servico (o mais proximo de "histograma" que a API do Prevision oferece). */

import { barrasHorizontais } from '../charts.js';
import { cartao, dataBR, escapar, kpi, ligar, n, opcoesSelect } from '../ui.js';

const POR_PAGINA = 25;
const estado = { busca: '', grupo: '', pagina: 0 };

export async function montar(alvo, ctx) {
  const o = await ctx.completa();
  const p = o.produtividade;
  ctx.cabecalho('Produtividade por serviço', o.nome);

  const grupos = [...new Set(p.linhas.map((x) => x.grupo).filter(Boolean))].sort();
  const lista = p.linhas.filter((x) => (!estado.grupo || x.grupo === estado.grupo)
    && (!estado.busca || x.servico.toLowerCase().includes(estado.busca.toLowerCase())));
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  estado.pagina = Math.min(estado.pagina, paginas - 1);
  const pagina = lista.slice(estado.pagina * POR_PAGINA, (estado.pagina + 1) * POR_PAGINA);
  const piores = p.linhas.filter((x) => (x.desvio || 0) < 0).slice(0, 10);

  if (!p.iniciados) {
    alvo.innerHTML = `<div class="aviso">Nenhum dos ${n(p.total)} serviços desta obra tem produção medida ainda. Serviço por começar tem produtividade
      zero, e isso não é desvio — por isso o painel só compara o que já iniciou.</div>`;
    return;
  }

  alvo.innerHTML = `
    <div class="aviso secao"><b>Sobre o "histograma":</b> a API do Prevision não publica histograma de efetivo/mão de obra. O que ela entrega é a
      <b>produtividade por serviço</b> — esta tela. O histograma de obras que a Hellen valida no Excel tem menu próprio (Histograma de obras).</div>

    <div class="grid grid--kpi secao">
      ${kpi({ rotulo: 'Serviços monitorados', valor: n(p.total), nota: `${n(p.iniciados)} com produção medida · ${n(p.nao_iniciados)} por iniciar` })}
      ${kpi({ rotulo: 'Abaixo do planejado', valor: n(p.abaixo_do_planejado), nota: `de ${n(p.iniciados)} já iniciados`, tom: p.abaixo_do_planejado / p.iniciados > 0.5 ? 'critical' : 'warning' })}
      ${kpi({ rotulo: 'No planejado ou acima', valor: n(p.iniciados - p.abaixo_do_planejado), nota: 'serviços iniciados', tom: 'good' })}
    </div>

    ${cartao('Maiores desvios de produtividade', '<div id="g-desvio"></div>', { sub: 'serviços já iniciados · desvio = produtividade realizada − base', classe: 'secao' })}

    <div class="filtros">
      <div class="busca"><input type="search" id="busca" placeholder="Buscar serviço…" value="${escapar(estado.busca)}"></div>
      <div class="campo campo--inline"><select id="grupo" aria-label="Grupo">${opcoesSelect(grupos, estado.grupo, { vazioRotulo: 'Todos os grupos' })}</select></div>
    </div>
    ${cartao('Serviços', `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Serviço</th><th>Grupo</th>
      <th class="num">Pavs.</th><th class="num">Feitos</th><th class="num">Saldo</th><th class="num">Base</th><th class="num">Prevista</th><th class="num">Realizada</th>
      <th class="num">Desvio</th><th>Tendência fim</th></tr></thead>
      <tbody>${pagina.map((x) => `<tr><td class="col-principal">${escapar(x.servico)}</td><td class="txt-mudo">${escapar(x.grupo)}</td>
        <td class="num">${n(x.pavimentos)}</td><td class="num">${n(x.realizados)}</td><td class="num">${n(x.saldo)}</td>
        <td class="num">${n(x.base, 2)}</td><td class="num">${n(x.prevista, 2)}</td><td class="num">${n(x.realizada, 2)}</td>
        <td class="num forte ${(x.desvio || 0) < 0 ? 'txt-crit' : 'txt-bom'}">${n(x.desvio, 2)}</td><td>${dataBR(x.tendencia_fim)}</td></tr>`).join('')
        || '<tr><td colspan="10" class="vazio">Nenhum serviço com este filtro.</td></tr>'}</tbody></table></div>
      <div class="paginacao"><span>${n(lista.length)} serviços · página ${estado.pagina + 1} de ${paginas}</span>
        <button class="btn btn--sm" data-pg="-1" ${estado.pagina === 0 ? 'disabled' : ''}>Anterior</button>
        <button class="btn btn--sm" data-pg="1" ${estado.pagina >= paginas - 1 ? 'disabled' : ''}>Próxima</button></div>`)}`;

  barrasHorizontais(alvo.querySelector('#g-desvio'),
    piores.map((x) => ({ rotulo: x.servico, valor: Math.abs(x.desvio), cor: 'var(--status-critical)' })),
    { larguraRotulo: 230, formatar: (v) => `−${n(v, 1)}` });

  alvo.querySelector('#grupo').onchange = (ev) => { estado.grupo = ev.target.value; estado.pagina = 0; montar(alvo, ctx); };
  const busca = alvo.querySelector('#busca');
  busca.onchange = () => { estado.busca = busca.value; estado.pagina = 0; montar(alvo, ctx); };
  ligar(alvo, '[data-pg]', 'click', (ev) => { estado.pagina += Number(ev.currentTarget.dataset.pg); montar(alvo, ctx); });
}
