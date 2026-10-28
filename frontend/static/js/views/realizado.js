/* Realizado (Caixa), do Mega (modulo ADO) - ver backend/app/services/realizado_mega.py. */

import { api } from '../api.js';
import {
  brl, brlC, cartao, dataBR, escapar, kpi, n, pct, pendente,
} from '../ui.js';

function semOrcamento(obraNome) {
  return pendente({
    tipo: 'breve',
    rotulo: 'Sem orçamento no Mega',
    titulo: 'Nenhum orçamento com o nome desta obra foi encontrado no Mega',
    corpo: `<p>O Realizado precisa de um orçamento cadastrado no módulo de Administração de Obras do Mega com o nome
      <b>${escapar(obraNome)}</b>. Pode ser que esta obra ainda não tenha orçamento lançado lá, ou que o nome esteja
      diferente do Prevision.</p>`,
  });
}

function semVinculo(obraNome) {
  return pendente({
    tipo: 'breve',
    rotulo: 'Vínculo com o Mega pendente',
    titulo: 'Esta obra ainda não está ligada a uma filial do Mega',
    corpo: `<p>O Realizado precisa saber qual filial do Mega corresponde a <b>${escapar(obraNome)}</b>. Vá em Configurações
      e clique em "Resolver vínculo com o Mega" para tentar achar automaticamente, ou defina manualmente lá.</p>`,
  });
}

function linhaFase(f) {
  const largura = f.orcado ? Math.min(100, (f.realizado_bruto / f.orcado) * 100) : 0;
  const estourou = f.orcado > 0 && f.realizado_bruto > f.orcado;
  return `<div class="par-linha">
    <div class="arvore__linha">
      <div class="arvore__nome"><span class="arvore__cod">${escapar(f.codigo)}</span><span class="txt">${escapar(f.descricao)}</span></div>
      <div class="num">${brl(f.orcado)}</div>
      <div class="num forte ${estourou ? 'txt-crit' : ''}">${brl(f.realizado_bruto)}</div>
      <div class="num txt-mudo">${f.pct === null ? '—' : pct(f.pct, 1)}</div>
    </div>
    <div class="medidor"><span style="width:${largura}%;background:${estourou ? 'var(--status-critical)' : 'var(--series-1)'}"></span></div>
  </div>`;
}

export async function montar(alvo, ctx) {
  const obra = ctx.obra;
  ctx.cabecalho('Realizado (Caixa)', obra.nome);

  let dados;
  try {
    dados = await api.get(`/api/realizado/${obra.id}`);
  } catch (erro) {
    if (erro.message.includes('vinculo com o Mega')) {
      alvo.innerHTML = semVinculo(obra.nome);
      return;
    }
    if (erro.message.includes('Nenhum orçamento')) {
      alvo.innerHTML = semOrcamento(obra.nome);
      return;
    }
    throw erro;
  }

  const { orcamento, realizado_bruto_total: realizadoTotal, por_fase: fases } = dados;
  const avanco = orcamento.orcado_total ? (realizadoTotal / orcamento.orcado_total) * 100 : null;

  alvo.innerHTML = `
    <div class="aviso secao"><b>Valor preliminar, sem correção monetária:</b> o Mega aplica alguma correção/encargo sobre o lançamento bruto que ainda
      não confirmamos com Suprimentos/Financeiro (mesma pendência do INCC já registrada em Custos) — por isso o valor aqui pode ficar diferente do
      relatório oficial do Mega, para mais ou para menos. Orçamento usado: <b>${escapar(orcamento.descricao)}</b>${orcamento.ambiguo ? ' (havia mais de uma versão com este nome; usada a mais recente ativa)' : ''}.</div>

    <div class="grid grid--kpi secao">
      ${kpi({ rotulo: 'Orçado (Mega)', valor: brlC(orcamento.orcado_total), nota: dataBR(orcamento.data_referencia) })}
      ${kpi({ rotulo: 'Realizado bruto', valor: brlC(realizadoTotal), tom: 'info' })}
      ${kpi({ rotulo: 'Avanço financeiro', valor: avanco === null ? '—' : pct(avanco, 1), tom: avanco !== null && avanco > 100 ? 'critical' : '' })}
      ${kpi({ rotulo: 'Lançamentos', valor: n(dados.lancamentos), nota: dados.data_inicio ? `${dataBR(dados.data_inicio)} – ${dataBR(dados.data_fim)}` : '—' })}
    </div>

    ${cartao('Realizado por fase', `
      <div class="arvore__linha arvore__linha--cab"><div>Fase</div><div class="num">Orçado</div><div class="num">Realizado bruto</div><div class="num">%</div></div>
      ${fases.map(linhaFase).join('') || '<div class="vazio">Sem fases cadastradas neste orçamento.</div>'}
    `, { sub: 'nível 1 do orçamento do Mega (módulo Administração de Obras)', plano: true })}`;
}
