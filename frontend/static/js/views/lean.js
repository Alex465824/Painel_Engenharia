/* Semanal e Lean: PPC, aderencia e causas de atraso. */

import { barrasHorizontais } from '../charts.js';
import { linhasSemanais } from '../graficos.js';
import { cartao, classeIndice, dataBR, kpi, n, pct } from '../ui.js';

const TETO_ADERENCIA = 200;
const tom = { bom: 'good', aten: 'warning', crit: 'critical', mudo: '' };

export async function montar(alvo, ctx) {
  const o = await ctx.completa();
  const l = o.lean;
  ctx.cabecalho('Semanal e Lean', o.nome);

  const temPlano = l.semanas_com_plano > 0 && l.ppc_4s !== null;
  const semanal = l.semanal.map((s) => {
    const plano = s.ppc > 0 || s.aderencia > 0;
    return { fim: s.fim, ppc: plano ? s.ppc : null, aderencia: plano ? s.aderencia : null, aderencia_vis: plano ? Math.min(s.aderencia, TETO_ADERENCIA) : null };
  });
  const estourou = semanal.filter((s) => s.aderencia !== null && s.aderencia > TETO_ADERENCIA).length;
  const validas = semanal.filter((s) => s.ppc !== null);
  const melhor = validas.length ? validas.reduce((m, s) => (s.ppc > m.ppc ? s : m)) : null;
  const pior = validas.length ? validas.reduce((m, s) => (s.ppc < m.ppc ? s : m)) : null;
  const c = l.causas;
  const pareto = c.motivos.map((m) => ({ rotulo: m.motivo, valor: m.n, cor: 'var(--series-1)' }));

  alvo.innerHTML = `
    <div class="grid grid--kpi secao">
      ${kpi({ rotulo: 'PPC · 4 semanas', valor: temPlano ? pct(l.ppc_4s, 0) : '—', nota: temPlano ? `meta ${n(o.metas.ppc, 0)}%` : 'sem plano de curto prazo na janela', tom: temPlano ? tom[classeIndice(l.ppc_4s, o.metas.ppc)] : '' })}
      ${kpi({ rotulo: 'Aderência · 4 semanas', valor: temPlano ? pct(l.aderencia_4s, 0) : '—', nota: temPlano && l.aderencia_4s > 120 ? 'acima de 100%: executou mais que o planejado' : 'executado ÷ planejado' })}
      ${kpi({ rotulo: 'Semanas com plano', valor: `${l.semanas_com_plano} <span style="font-size:15px;color:var(--text-muted);font-weight:500">de ${l.semanal.length}</span>`, nota: 'nas últimas 8 semanas' })}
      ${kpi({ rotulo: 'Melhor / pior semana', valor: melhor ? `${n(melhor.ppc, 0)}% / ${n(pior.ppc, 0)}%` : '—', nota: melhor ? `${dataBR(melhor.fim)} · ${dataBR(pior.fim)}` : '' })}
      ${kpi({ rotulo: 'Causa do atraso registrada', valor: c.cobertura_pct === null ? '—' : pct(c.cobertura_pct, 0), nota: c.atrasados ? `${n(c.atrasados_com_motivo)} de ${n(c.atrasados)} apontamentos atrasados` : 'sem apontamentos atrasados', tom: c.cobertura_pct !== null && c.cobertura_pct < 20 ? 'warning' : '' })}
    </div>

    ${temPlano || validas.length ? `
    <div class="grid grid--2 secao">
      ${cartao('PPC semanal', '<div id="g-ppc"></div>', { sub: `% das tarefas planejadas que foram concluídas · meta ${n(o.metas.ppc, 0)}%` })}
      ${cartao('Aderência semanal', '<div id="g-ader"></div>', { sub: `executado ÷ planejado${estourou ? ` · ${estourou} semana(s) acima de ${TETO_ADERENCIA}% cortadas no gráfico` : ''}` })}
    </div>` : `<div class="aviso secao">Esta obra não tem plano de curto prazo nas últimas 8 semanas, então não há PPC para mostrar.</div>`}

    <div class="grid grid--2 secao">
      ${cartao('Causas de atraso', pareto.length
        ? '<div id="g-causas"></div>'
        : `<div class="vazio">Nenhum motivo de atraso registrado nas últimas ${c.medicoes_analisadas} medições.</div>`,
      { sub: `apontamentos das últimas ${c.medicoes_analisadas} medições` })}
      ${cartao('Como ler', `
        <div class="dica" style="display:grid;gap:10px">
          <p style="margin:0"><b>PPC</b> (Percent Plan Complete) mede quanto do que foi prometido para a semana foi de fato concluído. É o indicador central do Last Planner: PPC baixo é plano irreal ou obra sem fluxo.</p>
          <p style="margin:0"><b>Aderência</b> vem do campo <code>grip</code> da API do Prevision (executado ÷ planejado de curto prazo). Passa de 100% quando se executa mais do que foi planejado — e dispara quando quase nada foi planejado, como em obras na reta final. Por isso o gráfico corta em ${TETO_ADERENCIA}%.</p>
          <p style="margin:0"><b>Causa do atraso</b>: a análise de causas só funciona se o time registra o motivo. ${c.cobertura_pct !== null && c.cobertura_pct < 30 ? `Aqui apenas <b>${pct(c.cobertura_pct, 0)}</b> dos apontamentos atrasados têm motivo — o Pareto ao lado representa muito pouco do que realmente acontece.` : 'A cobertura do registro está razoável.'}</p>
        </div>`)}
    </div>`;

  if (alvo.querySelector('#g-ppc')) {
    linhasSemanais(alvo.querySelector('#g-ppc'), semanal, [{ chave: 'ppc', rotulo: 'PPC', cor: 'var(--series-1)' }], { meta: o.metas.ppc, maximo: 100 });
    linhasSemanais(alvo.querySelector('#g-ader'), semanal.map((s) => ({ ...s, aderencia: s.aderencia_vis })), [{ chave: 'aderencia', rotulo: 'Aderência', cor: 'var(--series-2)' }], { meta: 100, metaRotulo: '100%', maximo: TETO_ADERENCIA });
  }
  if (pareto.length) barrasHorizontais(alvo.querySelector('#g-causas'), pareto, { larguraRotulo: 230, formatar: (v) => n(v) });
}
