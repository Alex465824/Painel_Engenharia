/* Cronograma: Gantt por servico ou por pavimento, com linha de base, filtros e detalhe por atividade. */

import { gantt } from '../graficos.js';
import { abrirGaveta, barraDupla, cartao, dataBR, escapar, filtroChips, ligar, n, pct } from '../ui.js';

const POR_PAGINA = 28;
const estado = { visao: 'servicos', status: 'todos', busca: '', ordem: 'inicio', pagina: 0 };
const hojeISO = () => new Date().toISOString().slice(0, 10);

const situacao = (l) => (l.real >= 99.9 ? 'concluidas' : l.vencidas > 0 ? 'vencidas' : l.real < l.previsto - 3 ? 'atrasadas' : l.real > 0 ? 'andamento' : 'nao_iniciadas');

const STATUS = [
  ['todos', 'Todos'], ['vencidas', 'Com vencidas'], ['atrasadas', 'Atrás do plano'],
  ['andamento', 'Em andamento'], ['concluidas', 'Concluídos'], ['nao_iniciadas', 'Não iniciados'],
];

const ORDENS = {
  inicio: (a, b) => (a.inicio || '9') .localeCompare(b.inicio || '9'),
  fim: (a, b) => (a.fim || '9').localeCompare(b.fim || '9'),
  atraso: (a, b) => (b.atraso_max_dias ?? -999) - (a.atraso_max_dias ?? -999),
  avanco: (a, b) => a.real - b.real,
  vencidas: (a, b) => b.vencidas - a.vencidas,
};

export async function montar(alvo, ctx) {
  const [o, det] = await Promise.all([ctx.completa(), ctx.detalhe()]);
  ctx.cabecalho('Cronograma', o.nome);

  const base = estado.visao === 'servicos' ? o.servicos : o.pavimentos;
  const contagem = Object.fromEntries(STATUS.map(([k]) => [k, k === 'todos' ? base.length : base.filter((l) => situacao(l) === k).length]));
  let lista = base.filter((l) => (estado.status === 'todos' || situacao(l) === estado.status)
    && (!estado.busca || l.nome.toLowerCase().includes(estado.busca.toLowerCase())));
  lista = [...lista].sort(ORDENS[estado.ordem]);
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  estado.pagina = Math.min(estado.pagina, paginas - 1);
  const pagina = lista.slice(estado.pagina * POR_PAGINA, (estado.pagina + 1) * POR_PAGINA);

  alvo.innerHTML = `
    <div class="filtros">
      <div class="chip-grupo" style="display:flex;gap:8px">
        ${[['servicos', 'Por serviço'], ['pavimentos', 'Por pavimento']].map(([k, r]) => `<button class="chip ${estado.visao === k ? 'is-ativo' : ''}" data-visao="${k}">${r}</button>`).join('')}
      </div>
      <div class="busca"><input type="search" id="busca" placeholder="Buscar ${estado.visao === 'servicos' ? 'serviço' : 'pavimento'}…" value="${escapar(estado.busca)}"></div>
      <div class="campo campo--inline"><select id="ordem" aria-label="Ordenar">
        ${[['inicio', 'Ordenar: início'], ['fim', 'Ordenar: término'], ['atraso', 'Ordenar: maior atraso vs base'], ['avanco', 'Ordenar: menor avanço'], ['vencidas', 'Ordenar: mais vencidas']]
          .map(([k, r]) => `<option value="${k}" ${estado.ordem === k ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
    </div>
    ${filtroChips(STATUS.map(([k, r]) => ({ valor: k, rotulo: r, n: contagem[k] })), estado.status)}
    ${cartao(`Gantt por ${estado.visao === 'servicos' ? 'serviço' : 'pavimento'}`, `
      <div class="gantt-wrap" id="g-gantt"></div>
      <div class="legenda">
        <span class="legenda__item"><span class="legenda__marca" style="background:var(--series-1)"></span>em dia</span>
        <span class="legenda__item"><span class="legenda__marca" style="background:var(--status-serious)"></span>atrás do plano</span>
        <span class="legenda__item"><span class="legenda__marca" style="background:var(--status-good)"></span>concluído</span>
        <span class="legenda__item"><span class="legenda__marca" style="background:#898781;height:4px;margin-top:4px"></span>linha de base</span>
        <span class="legenda__item"><span style="width:2px;height:12px;background:var(--text-primary);display:inline-block"></span>&nbsp;% previsto</span>
      </div>
      <div class="paginacao"><span>${n(lista.length)} de ${n(base.length)} · página ${estado.pagina + 1} de ${paginas}</span>
        <button class="btn btn--sm" data-pg="-1" ${estado.pagina === 0 ? 'disabled' : ''}>Anterior</button>
        <button class="btn btn--sm" data-pg="1" ${estado.pagina >= paginas - 1 ? 'disabled' : ''}>Próxima</button></div>`,
    { sub: 'clique em uma linha para ver as atividades dela' })}`;

  gantt(alvo.querySelector('#g-gantt'), pagina, { hoje: hojeISO(), aoClicar: (l) => detalhar(l, det.atividades) });

  ligar(alvo, '[data-visao]', 'click', (ev) => { estado.visao = ev.currentTarget.dataset.visao; estado.pagina = 0; estado.busca = ''; montar(alvo, ctx); });
  ligar(alvo, '[data-filtro]', 'click', (ev) => { estado.status = ev.currentTarget.dataset.filtro; estado.pagina = 0; montar(alvo, ctx); });
  ligar(alvo, '[data-pg]', 'click', (ev) => { estado.pagina += Number(ev.currentTarget.dataset.pg); montar(alvo, ctx); });
  alvo.querySelector('#ordem').onchange = (ev) => { estado.ordem = ev.target.value; estado.pagina = 0; montar(alvo, ctx); };
  const busca = alvo.querySelector('#busca');
  busca.onchange = () => { estado.busca = busca.value; estado.pagina = 0; montar(alvo, ctx); };
}

function detalhar(linha, atividades) {
  const campo = estado.visao === 'servicos' ? 'servico' : 'pavimento';
  const outro = estado.visao === 'servicos' ? 'pavimento' : 'servico';
  const itens = atividades.filter((x) => x[campo] === linha.nome).sort((a, b) => (a.inicio || '').localeCompare(b.inicio || ''));
  const gaveta = abrirGaveta(`
    <div class="drawer__head"><div><h2>${escapar(linha.nome)}</h2>
      <p>${n(linha.n)} atividades · real ${pct(linha.real, 0)} · previsto ${pct(linha.previsto, 0)}</p></div>
      <button class="icon-btn" data-fechar-gaveta aria-label="Fechar">&times;</button></div>
    <div class="drawer__body"><div class="tabela-wrap"><table class="tabela"><thead><tr>
      <th>${outro === 'pavimento' ? 'Pavimento' : 'Serviço'}</th><th>Período</th><th>Término na base</th><th>Real</th><th class="num">Atraso vs base</th></tr></thead>
      <tbody>${itens.map((x) => `<tr>
        <td class="col-principal">${escapar(x[outro])}</td>
        <td>${dataBR(x.inicio)} → ${dataBR(x.fim)}${x.vencida ? ' <span class="tag tag--critical">vencida</span>' : ''}</td>
        <td>${dataBR(x.base_fim)}</td><td>${barraDupla(x.real, x.previsto)}</td>
        <td class="num ${(x.atraso_dias || 0) > 0 ? 'txt-crit forte' : 'txt-mudo'}">${x.atraso_dias === null ? '—' : `${n(x.atraso_dias)} d`}</td></tr>`).join('')}</tbody></table></div></div>`);
  gaveta.querySelector('[data-fechar-gaveta]').onclick = () => document.getElementById('drawer-backdrop').click();
}
