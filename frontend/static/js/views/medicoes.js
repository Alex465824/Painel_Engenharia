/* Medicoes: cadencia e defasagem. Medicao desatualizada deixa todos os indicadores velhos. */

import { barrasHorizontais } from '../charts.js';
import { cartao, dataBR, kpi, n } from '../ui.js';

const DIA = 86400000;

export async function montar(alvo, ctx) {
  const o = await ctx.completa();
  const m = o.medicoes;
  ctx.cabecalho('Medições', o.nome);

  if (!m.total) {
    alvo.innerHTML = '<div class="aviso">Esta obra ainda não tem nenhuma medição registrada no Prevision.</div>';
    return;
  }

  const parametros = ctx.parametros || {};
  const ativa = ['atrasada', 'no_prazo'].includes(o.status);
  const dias = m.dias_desde_ultima;
  const tom = !ativa ? '' : dias > 21 ? 'critical' : dias > 10 ? 'warning' : 'good';

  const linhas = m.datas.map((d, i) => {
    const anterior = m.datas[i + 1];
    const intervalo = anterior ? Math.round((new Date(d) - new Date(anterior)) / DIA) : null;
    return { data: d, intervalo };
  });
  const barras = linhas.filter((l) => l.intervalo !== null).slice(0, 14).reverse()
    .map((l) => ({ rotulo: dataBR(l.data), valor: l.intervalo, sufixo: ' d', cor: l.intervalo > 10 ? 'var(--status-warning)' : 'var(--series-1)' }));
  const lacunas = linhas.filter((l) => l.intervalo !== null && l.intervalo > 14);

  alvo.innerHTML = `
    <div class="grid grid--kpi secao">
      ${kpi({ rotulo: 'Medições registradas', valor: n(m.total), nota: 'desde o início da obra' })}
      ${kpi({ rotulo: 'Última medição', valor: dataBR(m.ultima), nota: dias === null ? '' : `há ${n(dias)} dias` })}
      ${kpi({ rotulo: 'Defasagem', valor: ativa ? `${n(dias)} d` : '—', nota: ativa ? 'dias desde a última medição' : 'obra fora de execução', tom })}
      ${kpi({ rotulo: 'Intervalo médio', valor: m.intervalo_medio_dias === null ? '—' : `${n(m.intervalo_medio_dias, 1)} d`, nota: 'entre as últimas medições' })}
    </div>
    ${ativa && dias > 10 ? `<div class="aviso secao">Faz <b>${n(dias)} dias</b> desde a última medição. Enquanto não houver medição nova, avanço, IDP, PPC e atrasos desta obra
      ficam parados no que foi medido naquele dia.${o.avanco.realizado_pct >= 95 ? ' Como a obra já está em ' + n(o.avanco.realizado_pct, 1) + '%, talvez só falte encerrá-la no Prevision.' : ''}</div>` : ''}

    <div class="grid grid--2 secao">
      ${cartao('Intervalo entre medições', '<div id="g-int"></div>', { sub: 'dias entre cada medição e a anterior — em âmbar, acima de 10 dias' })}
      ${cartao('Datas das medições', `<div class="tabela-wrap" style="max-height:340px;overflow:auto"><table class="tabela"><thead><tr><th>Data</th><th class="num">Intervalo para a anterior</th></tr></thead>
        <tbody>${linhas.map((l) => `<tr><td class="col-principal">${dataBR(l.data)}</td><td class="num ${l.intervalo > 14 ? 'txt-aten forte' : 'txt-mudo'}">${l.intervalo === null ? '—' : `${n(l.intervalo)} d`}</td></tr>`).join('')}</tbody></table></div>`,
      { plano: true, sub: lacunas.length ? `${lacunas.length} intervalo(s) acima de 14 dias` : 'cadência regular' })}
    </div>

    ${cartao('Medições de contrato (financeiro)', `<div class="dica">Esta tela mostra as medições de <b>avanço físico</b> do Prevision. As medições de <b>contrato</b>
      (valor medido, retenção, pagamento a fornecedor) ficam no Mega — menu <b>Contratos e medições</b>.</div>`)}`;

  barrasHorizontais(alvo.querySelector('#g-int'), barras, { formatar: (v) => n(v), larguraRotulo: 100 });
}
