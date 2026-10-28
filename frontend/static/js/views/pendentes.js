/* Telas que dependem de uma fonte ainda nao liberada. Em vez de uma tela vazia, dizem o que falta,
   o que cada coisa vai mostrar e, quando da, verificam a conexao ao vivo. */

import { api } from '../api.js';
import { cartao, escapar, ligar, pendente, toast } from '../ui.js';

const TELAS = {
  histograma: {
    titulo: 'Histograma de obras', tipo: 'excel', rotulo: 'Em validação no Excel',
    corpo: '<p>O histograma de obras ainda está sendo validado em planilha pela Hellen. Quando a planilha fechar, esta tela lê o arquivo direto e mostra o histograma por obra.</p>',
    itens: [
      'O arquivo (.xlsx) ou o caminho dele na rede, já no formato final.',
      'Qual aba usar e se o histograma é de efetivo / mão de obra por período ou de outra grandeza.',
      'A granularidade (semana ou mês) e se é por obra ou consolidado.',
      'Como a obra é identificada na planilha (o nome é igual ao do Prevision?).',
      'Quem mantém e com que frequência atualiza.',
    ],
    alternativa: 'Enquanto isso, o menu <b>Produtividade</b> mostra o que o Prevision publica: produtividade por serviço, com os maiores desvios.',
  },
  consumo: {
    titulo: 'Controle de consumo', tipo: 'excel', rotulo: 'Controle mantido em Excel',
    corpo: '<p>O controle de consumo de material é mantido em planilha pela equipe. O backend já tem um leitor de planilhas preparado; falta mapear as colunas da planilha real.</p>',
    itens: [
      'O arquivo (.xlsx) ou o caminho dele na rede.',
      'Quais materiais são acompanhados.',
      'Qual é a referência de consumo previsto: o orçamento? um índice por m²?',
      'A periodicidade de atualização e como a obra é identificada na planilha.',
    ],
  },
  incorporacao: {
    titulo: 'Incorporação', tipo: 'token', rotulo: 'Precisa de outro token', verificar: 'prevision_incorporacao',
    corpo: `<p>O Prevision tem um módulo de <b>Incorporação</b> com tarefas, responsáveis, etiquetas, kanban e o atraso de cada tarefa contra a linha de base.
      É a fonte natural para o acompanhamento da Gadens como incorporadora — mas o token usado hoje não tem permissão nele (HTTP 401).</p>`,
    itens: [
      'Um token do Prevision com permissão (escopo) de <b>incorporação</b> — ou o ajuste do atual, pedido ao administrador do Prevision.',
      'Confirmar quais projetos da Gadens estão cadastrados nesse módulo.',
      'Com isso entram: atraso por tarefa, responsável, kanban por etapa e a definição de qual obra pertence a qual empresa.',
    ],
  },
  mega_nivel: {
    titulo: 'Custo por nível', tipo: 'mega', rotulo: 'Aguardando Mega', verificar: 'mega',
    corpo: `<p>Custo realizado por nível da estrutura de orçamento, abrindo até o lançamento. É o "Fechamento de Custos" do BI atual, mas navegável.
      A árvore de <b>orçado</b> já existe no menu Custos (vinda do Prevision); o realizado do Mega entra nas mesmas linhas.</p>`,
    itens: [
      'Database link do Mega liberado (hoje devolve ORA-28267).',
      'Lançamentos de custo com o código do item de orçamento, para casar com a estrutura que o Prevision já fornece.',
      'A fórmula de indexação (INCC) usada pela equipe, para as colunas "Realizado INCC" e "Tendência INCC".',
    ],
  },
  mega_contratos: {
    titulo: 'Contratos e medições', tipo: 'mega', rotulo: 'Aguardando Mega', verificar: 'mega',
    corpo: '<p>Contratos por fornecedor e suas medições: valor contratado, aditivos, medido acumulado, retenção e saldo a medir. As medições de <b>avanço físico</b> do Prevision já estão no menu Medições.</p>',
    itens: [
      'Database link do Mega liberado (hoje devolve ORA-28267).',
      'Tabelas de contratos, aditivos e medições de contrato.',
    ],
  },
};

function mensagemSuporte(d) {
  const erro = (d.dblink_erro || '').split('\n').filter((l) => l.startsWith('ORA-')).join('\n  ');
  const link = d.dblink || {};
  return `Assunto: Database link ${link.nome || 'GADENS'} falha no logon remoto (ORA-28267)

Olá, equipe Mega.

No acesso externo ao banco da Gadens (${d.banco_local}), a conexão abre normalmente, mas toda consulta pelo database link ${link.nome || 'GADENS'} falha com:
  ${erro}

O que investigamos:
- O link ${link.nome || 'GADENS'} entra no servidor remoto como usuário ${link.usuario_remoto || 'CONSULTAS'} em ${link.destino || '(destino não informado)'}.
- ${d.dual_remoto_ok ? 'SELECT 1 FROM DUAL@' + (link.nome || 'GADENS') + ' funciona' : 'Falha também em SELECT 1 FROM DUAL@' + (link.nome || 'GADENS') + ', ou seja, não é permissão em tabela: a sessão remota não chega a ser estabelecida'}.
- A consulta de exemplo que vocês indicaram (SELECT * FROM GADENS.glo_agentes@GADENS) falha do mesmo jeito.

Hipótese, a confirmar por vocês: o ORA-28267 costuma vir de contexto de aplicação / Oracle Label Security, por exemplo um gatilho de logon do usuário ${link.usuario_remoto || 'CONSULTAS'} que define um namespace de contexto a partir de dados da sessão de origem e não o aceita quando a conexão vem por database link.

Pedido: ajustar o logon desse usuário (ou o contexto/OLS) para aceitar conexões via database link e nos avisar para validarmos com SELECT 1 FROM DUAL@${link.nome || 'GADENS'}.

Obrigado.`;
}

export async function montar(alvo, ctx, chave) {
  const t = TELAS[chave];
  ctx.cabecalho(t.titulo, t.verificar ? 'Aguardando liberação de acesso' : 'Aguardando a planilha');

  alvo.innerHTML = `
    <div class="secao">${pendente({ tipo: t.tipo, rotulo: t.rotulo, titulo: t.titulo, corpo: t.corpo, itens: t.itens })}</div>
    ${t.alternativa ? `<div class="aviso">${t.alternativa}</div>` : ''}
    ${t.verificar ? cartao('Estado da conexão agora', `<div id="estado-conexao" class="dica">Clique para testar a conexão neste instante.</div>
      <div style="margin-top:12px"><button class="btn btn--sm" id="btn-verificar">Verificar agora</button></div>
      <div id="ticket" style="margin-top:16px"></div>`) : ''}`;

  const botao = alvo.querySelector('#btn-verificar');
  if (!botao) return;
  botao.onclick = async () => {
    botao.disabled = true;
    const caixa = alvo.querySelector('#estado-conexao');
    caixa.textContent = 'Testando…';
    try {
      const r = await api.post(`/api/integracoes/verificar/${t.verificar}`);
      caixa.innerHTML = `<b class="${r.ok ? 'txt-bom' : 'txt-crit'}">${r.ok ? 'Funcionando' : r.parcial ? 'Parcial' : 'Com falha'}</b> — ${escapar(r.detalhe)}`;
      const ticket = alvo.querySelector('#ticket');
      if (ticket && r.diagnostico && !r.ok) {
        ticket.innerHTML = `<div class="dica" style="margin-bottom:6px"><b>Mensagem pronta para o suporte do Mega</b> (gerada com o diagnóstico acima):</div>
          <textarea id="ticket-txt" readonly style="min-height:300px;font-size:12px;line-height:1.5">${escapar(mensagemSuporte(r.diagnostico))}</textarea>
          <div style="margin-top:8px"><button class="btn btn--sm" id="btn-copiar">Copiar mensagem</button></div>`;
        ticket.querySelector('#btn-copiar').onclick = async () => {
          const txt = ticket.querySelector('#ticket-txt');
          try { await navigator.clipboard.writeText(txt.value); toast('Mensagem copiada.'); }
          catch { txt.select(); toast('Selecionei o texto: use Ctrl+C.'); }
        };
      } else if (ticket) { ticket.innerHTML = ''; }
    } catch (erro) { toast(erro.message, 'erro'); caixa.textContent = erro.message; }
    botao.disabled = false;
  };
}
