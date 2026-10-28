/* Configuracoes: vinculo obra -> empresa, metas e limiares, e a atualizacao dos dados. */

import { api } from '../api.js';
import { EMPRESAS } from '../menu.js';
import { carregarConsolidado, invalidar } from '../store.js';
import { campo, cartao, dataBR, escapar, ligar, n, opcoesSelect, tagStatus, tempoRelativo, toast } from '../ui.js';

const ROTULO_PARAM = {
  meta_idp: ['Meta do IDP', 'realizado ÷ base. Copiada do BI atual (0,90).', 0.01],
  meta_idc: ['Meta do IDC', 'desempenho de custo. Copiada do BI atual (0,90). Ainda sem dado: depende do Mega.', 0.01],
  meta_iqo: ['Meta do IQO', 'qualidade. Copiada do BI atual (0,80). Ainda sem dado: fórmula não confirmada.', 0.01],
  meta_ppc: ['Meta do PPC (%)', 'ATENÇÃO: 80% é uma premissa minha, não vem do BI. Confirme com o Planejamento.', 1],
  atraso_critico_dias: ['Atraso crítico (dias)', 'a partir de quantos dias além da base o alerta vira crítico.', 1],
  medicao_atencao_dias: ['Medição: atenção (dias)', 'dias sem medição para alertar.', 1],
  medicao_critica_dias: ['Medição: crítico (dias)', 'dias sem medição para alertar como crítico.', 1],
};

export async function montar(alvo, ctx) {
  ctx.cabecalho('Configurações', 'Vínculos, metas e dados');
  const c = await api.get('/api/config');
  const obras = c.obras;
  const semVinculo = obras.filter((o) => !o.empresa).length;

  const linhas = obras.map((o) => `<tr data-id="${o.id}">
    <td class="col-principal">${escapar(o.nome)}</td><td>${tagStatus(o.status)}</td>
    <td><select data-campo="empresa" aria-label="Empresa de ${escapar(o.nome)}">${opcoesSelect(
      Object.entries(EMPRESAS).map(([k, e]) => ({ valor: k, texto: e.nome })), o.empresa, { vazioRotulo: '— não definida —' })}</select></td>
    <td><input type="number" step="0.01" data-campo="meta_idp" placeholder="${n(c.parametros.meta_idp, 2)}" value="${o.meta_idp ?? ''}" aria-label="Meta IDP própria"></td>
    <td><input type="number" step="1" data-campo="meta_ppc" placeholder="${n(c.parametros.meta_ppc, 0)}" value="${o.meta_ppc ?? ''}" aria-label="Meta PPC própria"></td></tr>`).join('');

  const h = c.historico;
  alvo.innerHTML = `
    ${semVinculo ? `<div class="aviso">${semVinculo} de ${obras.length} obras ainda não têm empresa. Enquanto o vínculo não estiver completo,
      <b>Gadens e Make IT enxergam todas as obras</b>. Assim que ao menos uma obra for vinculada, cada empresa passa a ver só as suas.</div>` : ''}

    ${cartao('Obras por empresa', `<div class="tabela-wrap"><table class="tabela tabela-ed"><thead><tr><th>Obra</th><th>Status</th><th>Empresa</th>
      <th>Meta IDP própria</th><th>Meta PPC própria (%)</th></tr></thead><tbody>${linhas}</tbody></table></div>`,
    { plano: true, sub: 'salva ao escolher. As metas próprias são opcionais e valem no lugar das globais; em branco usa a global', classe: 'secao' })}

    <div class="grid grid--2 secao">
      ${cartao('Metas e limiares globais', `<form id="form-param" style="display:grid;gap:12px">
        ${Object.entries(ROTULO_PARAM).map(([k, [r, aj, passo]]) => campo(r, `<input type="number" step="${passo}" name="${k}" value="${c.parametros[k]}">`, aj)).join('')}
        <div style="display:flex;gap:8px"><button class="btn btn--primario" type="submit">Salvar</button>
        <button class="btn" type="button" id="btn-padrao">Restaurar padrão</button></div></form>`)}
      ${cartao('Dados', `<div style="display:grid;gap:12px">
        <div class="dica">O painel guarda um retrato das obras e o reaproveita; ele é refeito sozinho quando tem mais de <b>${c.cache_ttl_horas} h</b> ao subir o servidor,
          ou quando alguém clica em <b>Atualizar</b> no topo.</div>
        <div class="lista-def">
          <div class="lista-def__linha"><span class="lista-def__rotulo">Obras em cache</span><span>${obras.length}</span></div>
          <div class="lista-def__linha"><span class="lista-def__rotulo">Mais antiga</span><span>${obras.length ? tempoRelativo(obras.reduce((a, o) => (o.atualizado_em < a ? o.atualizado_em : a), obras[0].atualizado_em)) : '—'}</span></div>
          <div class="lista-def__linha"><span class="lista-def__rotulo">Histórico diário</span><span>${h.registros ? `${n(h.registros)} registros, de ${dataBR(h.desde)} a ${dataBR(h.ate)}` : 'ainda sem registros'}</span></div>
        </div>
        <div class="dica">O histórico serve para mostrar evolução no tempo (IDP, avanço, PPC). O Prevision só informa a situação de agora, então ele só pode ser
          construído a partir do dia em que o painel começou a registrar.</div></div>`)}
    </div>`;

  ligar(alvo, 'tr[data-id]', 'change', async (ev) => {
    const linha = ev.currentTarget;
    const lerNum = (nome) => { const v = linha.querySelector(`[data-campo="${nome}"]`).value; return v === '' ? null : Number(v); };
    try {
      await api.put(`/api/config/obras/${linha.dataset.id}`, {
        empresa: linha.querySelector('[data-campo="empresa"]').value || null,
        meta_idp: lerNum('meta_idp'), meta_ppc: lerNum('meta_ppc'),
      });
      invalidar();
      await carregarConsolidado(true);
      if (ctx.atualizarShell) ctx.atualizarShell();
      toast('Salvo.');
      if (ev.target.dataset.campo === 'empresa') montar(alvo, ctx);
    } catch (erro) { toast(erro.message, 'erro'); }
  });

  const gravar = async (valores) => {
    try {
      await api.put('/api/config/parametros', valores);
      invalidar();
      await carregarConsolidado(true);
      if (ctx.atualizarShell) ctx.atualizarShell();
      toast('Metas salvas. Os alertas já usam os novos valores.');
      montar(alvo, ctx);
    } catch (erro) { toast(erro.message, 'erro'); }
  };
  alvo.querySelector('#form-param').onsubmit = (ev) => {
    ev.preventDefault();
    gravar(Object.fromEntries([...new FormData(ev.target).entries()].map(([k, v]) => [k, Number(v)])));
  };
  alvo.querySelector('#btn-padrao').onclick = () => gravar(c.parametros_padrao);
}
