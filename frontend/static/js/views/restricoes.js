/* Restricoes de obra: cadastro, importacao de planilha e os indicadores que o BI atual mostra.
   A API do Prevision nao publica restricoes, entao elas ficam registradas neste painel. */

import { api } from '../api.js';
import { barrasHorizontais, donut, donutLegenda } from '../charts.js';
import { obrasVisiveis } from '../store.js';
import {
  abrirModal, campo, cartao, confirmar, dataBR, escapar, filtroChips, kpi, ligar, n, opcoesSelect, pct, tag, toast,
} from '../ui.js';

const estado = { obra: '', filtro: 'abertas', busca: '' };
const STATUS = ['Nao iniciada', 'Iniciada', 'Concluida'];
const ROTULO = { 'Nao iniciada': 'Não iniciada', Iniciada: 'Iniciada', Concluida: 'Concluída' };
const TOM = { 'Nao iniciada': 'neutro', Iniciada: 'info', Concluida: 'good' };

const abertas = (r) => r.status !== 'Concluida';

export async function montar(alvo, ctx) {
  const obras = obrasVisiveis();
  const ids = new Set(obras.map((o) => o.id));
  const todas = (await api.get('/api/restricoes')).filter((r) => ids.has(r.obra_id));
  const nomeObra = (id) => (obras.find((o) => o.id === id) || { nome: `#${id}` }).nome;
  const daObra = estado.obra ? todas.filter((r) => String(r.obra_id) === estado.obra) : todas;

  ctx.cabecalho('Restrições', 'Impedimentos que travam a produção',
    `<button class="btn btn--sm" id="btn-importar">Importar planilha</button>
     <button class="btn btn--primario btn--sm" id="btn-nova">Nova restrição</button>`);

  const aberta = daObra.filter(abertas);
  const emAtraso = aberta.filter((r) => r.situacao === 'em_atraso');
  const concluidas = daObra.filter((r) => !abertas(r));
  const comData = concluidas.filter((r) => r.prazo && r.concluida_em);
  const concAtraso = comData.filter((r) => r.concluida_em > r.prazo);
  const semData = concluidas.length - comData.length;
  const categorias = new Map();
  aberta.forEach((r) => categorias.set(r.categoria || 'Sem categoria', (categorias.get(r.categoria || 'Sem categoria') || 0) + 1));

  const FILTROS = [['abertas', 'Abertas', abertas], ['atraso', 'Em atraso', (r) => r.situacao === 'em_atraso'],
    ['concluidas', 'Concluídas', (r) => !abertas(r)], ['todas', 'Todas', () => true]];
  const contagem = Object.fromEntries(FILTROS.map(([k, , fn]) => [k, daObra.filter(fn).length]));
  const lista = daObra.filter(FILTROS.find(([k]) => k === estado.filtro)[2])
    .filter((r) => !estado.busca || `${r.descricao} ${r.responsavel || ''} ${r.categoria || ''}`.toLowerCase().includes(estado.busca.toLowerCase()));

  const vazioGeral = todas.length === 0;
  const linhas = lista.map((r) => `<tr>
    <td>${escapar(nomeObra(r.obra_id))}</td>
    <td class="col-principal" style="max-width:340px">${escapar(r.descricao)}${r.observacao ? `<div class="cel-obra__sub">${escapar(r.observacao)}</div>` : ''}</td>
    <td>${r.categoria ? tag(r.categoria, 'contorno') : '<span class="txt-mudo">—</span>'}</td>
    <td>${escapar(r.responsavel || '—')}</td>
    <td>${r.prazo ? dataBR(r.prazo) : '<span class="txt-mudo">sem prazo</span>'}${r.dias_atraso ? `<div class="cel-obra__sub txt-crit">${n(r.dias_atraso)} d em atraso</div>` : ''}</td>
    <td>${tag(ROTULO[r.status], TOM[r.status], { ponto: true })}</td>
    <td style="white-space:nowrap">
      ${r.status !== 'Concluida' ? `<button class="btn btn--sm" data-acao="concluir" data-id="${r.id}">Concluir</button>` : `<button class="btn btn--sm" data-acao="reabrir" data-id="${r.id}">Reabrir</button>`}
      <button class="icon-btn" data-acao="editar" data-id="${r.id}" aria-label="Editar" title="Editar">✎</button>
      <button class="icon-btn" data-acao="excluir" data-id="${r.id}" aria-label="Excluir" title="Excluir">×</button></td></tr>`).join('');

  alvo.innerHTML = `
    <div class="aviso">A API do Prevision <b>não publica restrições</b> (nenhum dos endpoints), embora o produto as tenha. Por isso elas ficam registradas aqui.
      Para não digitar duas vezes, prefira <b>Importar planilha</b> com o que for exportado do Prevision.</div>

    <div class="filtros"><div class="campo campo--inline"><select id="obra" aria-label="Obra">${opcoesSelect(obras.map((o) => ({ valor: o.id, texto: o.nome })), estado.obra, { vazioRotulo: 'Todas as obras' })}</select></div></div>

    ${vazioGeral ? `<div class="card"><div class="card__body cartao-vazio"><h3>Nenhuma restrição registrada ainda</h3>
      <p>Cadastre a primeira ou importe a planilha exportada do Prevision.</p></div></div>` : `
    <div class="grid grid--kpi secao">
      ${kpi({ rotulo: 'Total', valor: n(daObra.length) })}
      ${kpi({ rotulo: 'Abertas', valor: n(aberta.length), nota: `${n(aberta.filter((r) => r.status === 'Iniciada').length)} em tratativa`, tom: 'info' })}
      ${kpi({ rotulo: 'Abertas em atraso', valor: n(emAtraso.length), nota: 'prazo já passou', tom: emAtraso.length ? 'critical' : 'good' })}
      ${kpi({ rotulo: 'Concluídas', valor: n(concluidas.length), nota: comData.length ? `${pct(((comData.length - concAtraso.length) / comData.length) * 100, 0)} no prazo${semData ? ` (${n(semData)} sem data de conclusão)` : ''}` : (concluidas.length ? 'sem datas de conclusão para medir o prazo' : ''), tom: 'good' })}
      ${kpi({ rotulo: 'Concluídas em atraso', valor: n(concAtraso.length), nota: 'terminaram depois do prazo' })}
    </div>

    <div class="grid grid--3 secao">
      ${cartao('Abertas: situação', '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><div id="d-aberta"></div><div id="l-aberta" style="flex:1;min-width:130px"></div></div>')}
      ${cartao('Tratativas', '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><div id="d-trat"></div><div id="l-trat" style="flex:1;min-width:130px"></div></div>')}
      ${cartao('Concluídas: prazo', '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><div id="d-conc"></div><div id="l-conc" style="flex:1;min-width:130px"></div></div>')}
    </div>
    ${cartao('Abertas por categoria', categorias.size ? '<div id="g-cat"></div>' : '<div class="vazio">Sem restrições abertas.</div>', { classe: 'secao' })}`}

    ${filtroChips(FILTROS.map(([k, r]) => ({ valor: k, rotulo: r, n: contagem[k] })), estado.filtro)}
    ${cartao('Restrições', `<div class="filtros" style="padding:14px 14px 0"><div class="busca"><input type="search" id="busca" placeholder="Buscar descrição, responsável ou categoria…" value="${escapar(estado.busca)}"></div></div>
      <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Obra</th><th>Restrição</th><th>Categoria</th><th>Responsável</th><th>Prazo</th><th>Status</th><th></th></tr></thead>
      <tbody>${linhas || '<tr><td colspan="7" class="vazio">Nenhuma restrição neste filtro.</td></tr>'}</tbody></table></div>`, { plano: true })}`;

  if (!vazioGeral) {
    const d = (id, lid, dados) => { donut(alvo.querySelector(id), dados, { rotuloCentro: 'restrições', tamanho: 150 }); alvo.querySelector(lid).innerHTML = donutLegenda(dados); };
    d('#d-aberta', '#l-aberta', [
      { rotulo: 'Em atraso', valor: emAtraso.length, cor: 'var(--status-critical)' },
      { rotulo: 'No prazo', valor: aberta.filter((r) => r.situacao === 'no_prazo').length, cor: 'var(--series-1)' },
      { rotulo: 'Sem prazo', valor: aberta.filter((r) => r.situacao === 'sem_prazo').length, cor: 'var(--axis)' }]);
    d('#d-trat', '#l-trat', [
      { rotulo: 'Iniciada', valor: aberta.filter((r) => r.status === 'Iniciada').length, cor: 'var(--series-2)' },
      { rotulo: 'Não iniciada', valor: aberta.filter((r) => r.status === 'Nao iniciada').length, cor: 'var(--axis)' }]);
    d('#d-conc', '#l-conc', [
      { rotulo: 'No prazo', valor: comData.length - concAtraso.length, cor: 'var(--status-good)' },
      { rotulo: 'Em atraso', valor: concAtraso.length, cor: 'var(--status-critical)' },
      { rotulo: 'Sem data de conclusão', valor: semData, cor: 'var(--axis)' }]);
    if (categorias.size) {
      barrasHorizontais(alvo.querySelector('#g-cat'),
        [...categorias.entries()].sort((a, b) => b[1] - a[1]).map(([rotulo, valor]) => ({ rotulo, valor, cor: 'var(--series-1)' })), { larguraRotulo: 200 });
    }
  }

  const refazer = () => montar(alvo, ctx);
  alvo.querySelector('#obra').onchange = (ev) => { estado.obra = ev.target.value; refazer(); };
  ligar(alvo, '[data-filtro]', 'click', (ev) => { estado.filtro = ev.currentTarget.dataset.filtro; refazer(); });
  const busca = alvo.querySelector('#busca');
  busca.onchange = () => { estado.busca = busca.value; refazer(); };
  document.getElementById('btn-nova').onclick = () => formulario(null, obras, categorias, refazer);
  document.getElementById('btn-importar').onclick = () => importar(obras, refazer);

  ligar(alvo, '[data-acao]', 'click', async (ev) => {
    const { acao, id } = ev.currentTarget.dataset;
    const r = todas.find((x) => String(x.id) === id);
    if (acao === 'editar') return formulario(r, obras, categorias, refazer);
    try {
      if (acao === 'excluir') {
        if (!confirmar('Excluir esta restrição?')) return;
        await api.del(`/api/restricoes/${id}`);
      } else {
        await api.put(`/api/restricoes/${id}`, { ...r, status: acao === 'concluir' ? 'Concluida' : 'Iniciada', concluida_em: null });
      }
      refazer();
    } catch (erro) { toast(erro.message, 'erro'); }
  });
}

function formulario(r, obras, categorias, aoSalvar) {
  const usadas = [...categorias.keys()].filter((c) => c !== 'Sem categoria');
  abrirModal({
    titulo: r ? 'Editar restrição' : 'Nova restrição', confirmar: r ? 'Salvar' : 'Registrar',
    corpo: `${campo('Obra', `<select name="obra_id">${opcoesSelect(obras.map((o) => ({ valor: o.id, texto: o.nome })), r ? r.obra_id : (estado.obra || obras[0]?.id))}</select>`)}
      ${campo('O que está travando', `<textarea name="descricao" required>${escapar(r?.descricao || '')}</textarea>`)}
      <div class="form-linha">
        ${campo('Categoria', `<input type="text" name="categoria" list="cats" value="${escapar(r?.categoria || '')}"><datalist id="cats">${usadas.map((c) => `<option value="${escapar(c)}">`).join('')}</datalist>`)}
        ${campo('Responsável', `<input type="text" name="responsavel" value="${escapar(r?.responsavel || '')}">`)}</div>
      <div class="form-linha">
        ${campo('Prazo', `<input type="date" name="prazo" value="${r?.prazo || ''}">`)}
        ${campo('Status', `<select name="status">${opcoesSelect(STATUS.map((s) => ({ valor: s, texto: ROTULO[s] })), r?.status || 'Nao iniciada')}</select>`)}</div>
      ${campo('Observação', `<textarea name="observacao" style="min-height:56px">${escapar(r?.observacao || '')}</textarea>`)}`,
    aoConfirmar: async (d) => {
      const corpo = { ...d, obra_id: Number(d.obra_id), prazo: d.prazo || null, concluida_em: r?.concluida_em || null };
      if (r) await api.put(`/api/restricoes/${r.id}`, corpo); else await api.post('/api/restricoes', corpo);
      aoSalvar();
    },
  });
}

const ROTULO_CAMPO = { descricao: 'Descrição *', categoria: 'Categoria', responsavel: 'Responsável', prazo: 'Prazo', status: 'Status', criada_em: 'Criada em', concluida_em: 'Concluída em', observacao: 'Observação' };

function importar(obras, aoSalvar) {
  let previa = null;
  const modal = abrirModal({
    titulo: 'Importar restrições de planilha', largo: true, confirmar: 'Importar',
    subtitulo: 'Aceita .xlsx ou .csv, por exemplo exportado do Prevision. A primeira linha deve ser o cabeçalho.',
    corpo: `${campo('Obra que receberá as restrições', `<select name="obra_id">${opcoesSelect(obras.map((o) => ({ valor: o.id, texto: o.nome })), estado.obra || obras[0]?.id)}</select>`)}
      ${campo('Arquivo', '<input type="file" id="imp-arquivo" accept=".xlsx,.xlsm,.csv,.txt">')}
      <div id="imp-mapa"></div>`,
    aoConfirmar: async (d) => {
      if (!previa) throw new Error('Escolha um arquivo primeiro.');
      const mapa = {};
      modal.querySelectorAll('[data-campo]').forEach((s) => { if (s.value) mapa[s.dataset.campo] = s.value; });
      if (!mapa.descricao) throw new Error('Indique qual coluna traz a descrição da restrição.');
      const itens = previa.linhas.map((l) => Object.fromEntries(Object.entries(mapa).map(([campoDestino, col]) => [campoDestino, l[col]])));
      const r = await api.post('/api/restricoes/importar/lote', { obra_id: Number(d.obra_id), itens });
      toast(`${r.criadas} restrições importadas${r.ignoradas ? ` (${r.ignoradas} linhas sem descrição ignoradas)` : ''}.`);
      aoSalvar();
    },
  });
  modal.querySelector('#imp-arquivo').onchange = async (ev) => {
    const arquivo = ev.target.files[0];
    if (!arquivo) return;
    const caixa = modal.querySelector('#imp-mapa');
    caixa.innerHTML = '<div class="dica">Lendo a planilha…</div>';
    try {
      const fd = new FormData();
      fd.append('arquivo', arquivo);
      previa = await api.post('/api/restricoes/importar/previa', fd);
    } catch (erro) { previa = null; caixa.innerHTML = `<div class="aviso">${escapar(erro.message)}</div>`; return; }
    caixa.innerHTML = `<div class="dica" style="margin-bottom:10px"><b>${n(previa.total)}</b> linhas encontradas. Confira como as colunas foram associadas:</div>
      <div class="form-linha" style="grid-template-columns:1fr 1fr">${Object.entries(ROTULO_CAMPO).map(([c, r]) => campo(r,
        `<select data-campo="${c}">${opcoesSelect(previa.colunas, previa.sugestao[c], { vazioRotulo: '— não importar —' })}</select>`)).join('')}</div>
      <div class="dica" style="margin-top:10px">Prévia das primeiras linhas:</div>
      <div class="tabela-wrap" style="max-height:170px;overflow:auto"><table class="tabela"><thead><tr>${previa.colunas.map((c) => `<th>${escapar(c)}</th>`).join('')}</tr></thead>
      <tbody>${previa.amostra.map((l) => `<tr>${previa.colunas.map((c) => `<td>${escapar(l[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  };
}
