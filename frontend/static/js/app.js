/* Shell do painel: escolha de empresa, navegacao liberada por empresa, alertas, atualizacao dos dados. */

import { api } from './api.js';
import { EMPRESAS, ICONES, MENU, itensDaEmpresa, todosItens } from './menu.js';
import {
  alertasVisiveis, carregarConsolidado, definirEmpresa, definirObra, estado, invalidar,
  obraCompleta, detalheObra, obraSelecionada, obrasVisiveis, temVinculo,
} from './store.js';
import { escapar, fecharGaveta, spinner, tempoRelativo, toast } from './ui.js';

import * as consolidado from './views/consolidado.js';
import * as visao from './views/visao.js';
import * as fisica from './views/fisica.js';
import * as cronograma from './views/cronograma.js';
import * as atrasos from './views/atrasos.js';
import * as custos from './views/custos.js';
import * as medicoes from './views/medicoes.js';
import * as lean from './views/lean.js';
import * as produtividade from './views/produtividade.js';
import * as restricoes from './views/restricoes.js';
import * as pendentes from './views/pendentes.js';
import * as compras from './views/compras.js';
import * as realizado from './views/realizado.js';
import * as integracoes from './views/integracoes.js';
import * as configuracoes from './views/configuracoes.js';

const VIEWS = {
  consolidado, visao, fisica, cronograma, atrasos, custos, medicoes, lean, produtividade, restricoes,
  mega_compras: compras, mega_crystal: realizado, integracoes, configuracoes,
};
['histograma', 'consumo', 'incorporacao', 'mega_nivel', 'mega_contratos']
  .forEach((chave) => { VIEWS[chave] = { montar: (alvo, ctx) => pendentes.montar(alvo, ctx, chave) }; });

const el = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ rotas -- */

function rotaAtual() {
  const chave = (location.hash || '#consolidado').slice(1).split('/')[0];
  const permitidos = itensDaEmpresa(estado.empresa).flatMap((g) => g.itens);
  return permitidos.find((i) => i.chave === chave) || permitidos[0];
}

export function irPara(chave, obraId) {
  if (obraId) definirObra(Number(obraId));
  if (location.hash === `#${chave}`) desenhar(); else location.hash = `#${chave}`;
}

const contexto = {
  irPara,
  recarregar: () => desenhar(),
  cabecalho(titulo, subtitulo = '', acoes = '') {
    el('page-title').textContent = titulo;
    el('page-sub').textContent = subtitulo;
    el('page-actions').innerHTML = acoes;
  },
  completa: () => obraCompleta(obraSelecionada().id),
  detalhe: () => detalheObra(obraSelecionada().id),
  atualizarShell: () => atualizarShell(),
};

async function desenhar() {
  if (!estado.empresa) return;
  const item = rotaAtual();
  document.querySelectorAll('.nav__item').forEach((b) => b.classList.toggle('is-active', b.dataset.rota === item.chave));
  el('sidebar').classList.remove('is-aberta');
  fecharGaveta();
  document.title = `${item.rotulo} | Painel de Engenharia`;

  const alvo = el('content');
  const seletor = el('obra-seletor');
  const precisaObra = item.escopo === 'obra';
  seletor.hidden = !precisaObra || obrasVisiveis().length === 0;
  if (!seletor.hidden) preencherSeletorObra();

  contexto.empresa = estado.empresa;
  contexto.obra = obraSelecionada();
  contexto.cabecalho(item.rotulo, '', '');

  if (precisaObra && !contexto.obra) {
    alvo.innerHTML = `<div class="card"><div class="card__body cartao-vazio">
      <h3>Nenhuma obra para mostrar</h3>
      <p>${temVinculo() ? `Nenhuma obra está vinculada à ${escapar(EMPRESAS[estado.empresa].nome)}. Faça o vínculo em Configurações.` : 'Os dados ainda não foram carregados do Prevision.'}</p>
    </div></div>`;
    return;
  }

  alvo.innerHTML = spinner();
  try {
    await VIEWS[item.chave].montar(alvo, contexto);
  } catch (erro) {
    console.error(erro);
    alvo.innerHTML = `<div class="card"><div class="card__body">
      <h2>Não foi possível carregar esta tela</h2>
      <p style="color:var(--text-secondary);margin-top:8px">${escapar(erro.message)}</p></div></div>`;
  }
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------------------ cascas -- */

function preencherSeletorObra() {
  const sel = el('sel-obra');
  const atual = obraSelecionada();
  sel.innerHTML = obrasVisiveis().map((o) => `<option value="${o.id}" ${atual && o.id === atual.id ? 'selected' : ''}>${escapar(o.nome)}</option>`).join('');
  sel.onchange = () => { definirObra(Number(sel.value)); desenhar(); };
}

function montarNav() {
  const grupos = itensDaEmpresa(estado.empresa);
  el('nav').innerHTML = grupos.map((g) => `<div class="nav__grupo">${escapar(g.grupo)}</div>${g.itens.map((i) => `
    <button class="nav__item" data-rota="${i.chave}">
      <svg class="nav__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
           stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[i.icone] || ''}</svg>
      <span>${escapar(i.rotulo)}</span>
      ${i.chave === 'consolidado' ? '<span class="nav__badge" id="badge-criticos" hidden>0</span>' : ''}
      ${i.tag ? `<span class="nav__tag nav__tag--${i.tag[0]}">${escapar(i.tag[1])}</span>` : ''}
    </button>`).join('')}`).join('');
  document.querySelectorAll('.nav__item').forEach((b) => { b.onclick = () => irPara(b.dataset.rota); });
}

function atualizarCabecalhoEmpresa() {
  const e = EMPRESAS[estado.empresa];
  document.body.dataset.empresa = estado.empresa;
  el('empresa-nome').textContent = e.nome;
  el('empresa-tipo').textContent = e.tipo;
  el('empresa-ponto').style.background = e.cor;
}

function atualizarFrescor() {
  const obras = estado.consolidado?.obras || [];
  const caixa = el('frescor');
  if (!obras.length) { caixa.textContent = 'Sem dados carregados.'; return; }
  const maisAntigo = obras.reduce((a, o) => (o.atualizado_em < a ? o.atualizado_em : a), obras[0].atualizado_em);
  const horas = (Date.now() - new Date(maisAntigo).getTime()) / 3600000;
  caixa.classList.toggle('frescor--velho', horas > 12);
  caixa.innerHTML = `Dados do Prevision<br><b>${tempoRelativo(maisAntigo)}</b> · ${obras.length} obras`;
}

function atualizarAlertas() {
  const lista = alertasVisiveis();
  const criticos = lista.filter((a) => a.severidade === 'critico').length;
  const contador = el('alert-count');
  contador.textContent = lista.length;
  contador.hidden = lista.length === 0;
  contador.style.background = criticos ? 'var(--status-critical)' : 'var(--status-warning)';
  contador.style.color = criticos ? '#fff' : '#3d2900';
  const badge = el('badge-criticos');
  if (badge) { badge.textContent = criticos; badge.hidden = criticos === 0; }

  el('alert-sub').textContent = `${criticos} crítico${criticos === 1 ? '' : 's'} · ${lista.length} no total`;
  el('alert-list').innerHTML = lista.length
    ? lista.map((a) => `<button class="alerta alerta--${a.severidade}" data-view="${escapar(a.link.view)}" data-obra="${a.link.obra ?? ''}">
        <span class="alerta__barra"></span><span style="flex:1"><span class="alerta__titulo">${escapar(a.titulo)}</span>
        <span class="alerta__detalhe">${escapar(a.detalhe || '')}</span></span></button>`).join('')
    : '<div class="vazio">Nenhum alerta. Tudo em dia.</div>';
  el('alert-list').querySelectorAll('.alerta').forEach((b) => {
    b.onclick = () => { fecharGaveta(); irPara(b.dataset.view, b.dataset.obra || null); };
  });
}

function atualizarShell() {
  atualizarCabecalhoEmpresa();
  atualizarFrescor();
  atualizarAlertas();
}

/* -------------------------------------------------------------- atualizacao -- */

let acompanhando = false;

async function acompanharAtualizacao() {
  if (acompanhando) return;
  acompanhando = true;
  const faixa = el('progresso-global');
  const botao = el('btn-atualizar');
  botao.disabled = true;
  faixa.hidden = false;
  try {
    for (;;) {
      const s = await api.get('/api/atualizar/status');
      const feito = s.total ? Math.round((s.concluidas / s.total) * 100) : 0;
      el('progresso-barra').style.width = `${feito}%`;
      el('progresso-txt').textContent = s.total
        ? `Atualizando do Prevision: ${s.concluidas} de ${s.total} obras${s.em_andamento.length ? ` (${s.em_andamento.join(', ')})` : ''}`
        : 'Conectando ao Prevision…';
      if (!s.rodando) {
        const erros = Object.keys(s.erros || {});
        invalidar();
        await carregarConsolidado(true);
        atualizarShell();
        await desenhar();
        if (erros.length) toast(`Atualizado, mas falhou em: ${erros.join(', ')}`, 'erro');
        else toast('Dados atualizados.');
        break;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  } catch (erro) {
    toast(erro.message, 'erro');
  } finally {
    faixa.hidden = true;
    botao.disabled = false;
    acompanhando = false;
  }
}

async function pedirAtualizacao() {
  try {
    await api.post('/api/atualizar');
  } catch (erro) {
    toast(erro.message, 'erro');
    return;
  }
  acompanharAtualizacao();
}

/* --------------------------------------------------------------- escolha de empresa */

function mostrarEscolhaEmpresa(mensagem = '') {
  el('app').hidden = true;
  const gate = el('gate');
  gate.hidden = false;
  const obras = estado.consolidado?.obras || [];
  const cartoes = Object.entries(EMPRESAS).map(([chave, e]) => {
    const menus = itensDaEmpresa(chave).flatMap((g) => g.itens).map((i) => i.rotulo);
    const qtd = temVinculo() ? obras.filter((o) => o.empresa === chave).length : obras.length;
    return `<button class="empresa-card" data-empresa="${chave}" style="--cor:${e.cor}" type="button">
      <span class="empresa-card__tipo">${escapar(e.tipo)}</span>
      <img class="empresa-card__logo" src="${e.logo}" alt="${escapar(e.nome)}">
      <span class="empresa-card__desc">${escapar(e.desc)}</span>
      <span class="empresa-card__obras">${qtd} obra${qtd === 1 ? '' : 's'}${temVinculo() ? '' : ' (vínculo com a empresa ainda não definido)'}</span>
      <span class="empresa-card__menus"><b>${menus.length} menus:</b> ${escapar(menus.join(' · '))}</span>
    </button>`;
  }).join('');
  gate.innerHTML = `<div class="gate__inner">
    <div><img class="gate__logo" src="/static/img/logo.svg" alt="Grupo Gadens">
      <h1>Painel de Engenharia</h1>
      <p class="gate__lead">Escolha a empresa para começar. Os menus liberados mudam conforme o que cada uma acompanha.</p></div>
    ${mensagem ? `<div class="aviso">${escapar(mensagem)}</div>` : ''}
    <div class="gate__grid">${cartoes}</div>
    <p class="gate__rodape">Dados lidos do Prevision. Mega e planilhas internas entram conforme forem liberados.</p></div>`;
  gate.querySelectorAll('.empresa-card').forEach((b) => {
    b.onclick = () => { definirEmpresa(b.dataset.empresa); entrar(); };
  });
}

function mostrarCarregando(s) {
  el('app').hidden = true;
  const gate = el('gate');
  gate.hidden = false;
  gate.innerHTML = `<div class="gate__inner"><img class="gate__logo" src="/static/img/logo.svg" alt="Grupo Gadens">
    <h1>Buscando as obras no Prevision…</h1>
    <p class="gate__lead">Primeira carga: ${s.concluidas || 0} de ${s.total || '?'} obras. Leva cerca de meio minuto e só acontece uma vez; depois o painel abre direto.</p>
    ${spinner()}</div>`;
}

function entrar() {
  el('gate').hidden = true;
  el('app').hidden = false;
  montarNav();
  atualizarShell();
  if (!location.hash) location.hash = '#consolidado';
  desenhar();
}

/* ------------------------------------------------------------------- inicio -- */

async function iniciar() {
  el('btn-menu').onclick = () => el('sidebar').classList.toggle('is-aberta');
  el('btn-empresa').onclick = () => mostrarEscolhaEmpresa();
  el('btn-atualizar').onclick = pedirAtualizacao;
  const gaveta = el('alert-drawer');
  el('btn-alertas').onclick = () => {
    const abrindo = gaveta.hidden;
    gaveta.hidden = !abrindo;
    el('drawer-backdrop').hidden = !abrindo;
  };
  el('btn-fechar-alertas').onclick = fecharGaveta;
  window.addEventListener('hashchange', desenhar);

  try {
    await carregarConsolidado();
  } catch (erro) {
    el('gate').hidden = false;
    el('gate').innerHTML = `<div class="gate__inner"><h1>Servidor indisponível</h1><p class="gate__lead">${escapar(erro.message)}</p></div>`;
    return;
  }

  // primeira execucao: o servidor ainda esta buscando as obras
  if (!estado.consolidado.obras.length) {
    for (;;) {
      const s = await api.get('/api/atualizar/status');
      mostrarCarregando(s);
      if (!s.rodando) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    invalidar();
    await carregarConsolidado(true);
    if (!estado.consolidado.obras.length) {
      mostrarEscolhaEmpresa('Não foi possível carregar as obras do Prevision. Veja a tela Integrações para o diagnóstico.');
      return;
    }
  }

  if (estado.empresa && EMPRESAS[estado.empresa]) entrar(); else mostrarEscolhaEmpresa();
  if (estado.consolidado.atualizacao?.rodando) acompanharAtualizacao();
}

iniciar();
