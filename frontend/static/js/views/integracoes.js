/* Integracoes: o que esta ligado, o que nao esta e o que cada coisa destrava. */

import { api } from '../api.js';
import { cartao, escapar, ligar, tempoRelativo, toast } from '../ui.js';

function estadoDe(i) {
  const v = i.ultima_verificacao;
  if (!i.configurada) return ['', 'não configurada', 'txt-mudo'];
  if (!v) return ['', 'ainda não verificada nesta sessão', 'txt-mudo'];
  if (v.ok) return ['ok', 'funcionando', 'txt-bom'];
  return [v.parcial ? 'parcial' : 'falha', v.parcial ? 'parcial' : 'com falha', v.parcial ? 'txt-aten' : 'txt-crit'];
}

export async function montar(alvo, ctx) {
  ctx.cabecalho('Integrações', 'As fontes de dados do painel');
  const lista = await api.get('/api/integracoes');

  alvo.innerHTML = `
    <div class="grid secao" style="gap:12px">
      ${lista.map((i) => {
        const [cls, rotulo, txt] = estadoDe(i);
        const v = i.ultima_verificacao;
        return `<section class="card integ" data-chave="${i.chave}">
          <span class="integ__estado integ__estado--${cls}"></span>
          <div class="integ__corpo">
            <div class="integ__nome">${escapar(i.nome)} <span class="${txt}" style="font-size:12px;font-weight:600">· ${rotulo}</span></div>
            <div class="integ__desc">Alimenta: ${escapar(i.alimenta)}</div>
            ${v ? `<div class="integ__res">${escapar(v.detalhe)} <span class="txt-mudo">· verificado ${tempoRelativo(v.verificado_em)}</span></div>` : ''}
          </div>
          <button class="btn btn--sm" data-verificar="${i.chave}" ${i.configurada ? '' : 'disabled'}>Verificar</button>
        </section>`;
      }).join('')}
    </div>

    ${cartao('Como ler isso', `<div class="dica" style="display:grid;gap:8px">
      <p style="margin:0"><b>Prevision · Obras e cronograma</b> é a fonte de tudo o que o painel mostra hoje.</p>
      <p style="margin:0"><b>Prevision · Incorporação</b> e <b>Gestão de custos</b> respondem 401: o token atual foi emitido só para os módulos de obra e financeiro.
        Liberar essas permissões com o administrador do Prevision destrava as telas de Incorporação e a projeção de custo que o próprio Prevision calcula.</p>
      <p style="margin:0"><b>Mega</b>: a conexão com o banco abre, mas as consultas pelo database link devolvem <code>ORA-28267</code>.
        É um erro do lado do servidor do Mega (típico de Oracle Label Security), não de credencial. Precisa ser tratado pelo suporte ou DBA do Mega.
        É o que trava realizado, custo por nível, compras e contratos.</p>
      <p style="margin:0"><b>Planilhas</b> (histograma de obras e controle de consumo): aguardando os arquivos finais.</p></div>`)}`;

  ligar(alvo, '[data-verificar]', 'click', async (ev) => {
    const botao = ev.currentTarget;
    botao.disabled = true;
    botao.textContent = 'Verificando…';
    try {
      await api.post(`/api/integracoes/verificar/${botao.dataset.verificar}`);
      await montar(alvo, ctx);
    } catch (erro) {
      toast(erro.message, 'erro');
      botao.disabled = false;
      botao.textContent = 'Verificar';
    }
  });
}
