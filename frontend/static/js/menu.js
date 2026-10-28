/* Empresas e menus.

   ATENCAO: a liberacao de menus por empresa abaixo foi INFERIDA do BI atual (a visao da Gadens
   tinha Visao Geral / Cronograma / Custos; a da Make IT tinha tambem Restricoes, Histograma e
   Consumos) e do papel de cada empresa (Gadens incorporadora, Make IT construtora). Nao foi
   confirmada com o time de Planejamento e Controle. Para mudar, edite so a lista `empresas`
   de cada item: e o unico lugar onde essa regra existe. */

export const EMPRESAS = {
  gadens: {
    nome: 'Gadens', tipo: 'Incorporadora', cor: '#cc2027',
    logo: '/static/img/logo-gadens.png',
    desc: 'Incorporação: prazo, avanço físico e custo das obras do portfólio, da viabilidade à entrega.',
  },
  makeit: {
    nome: 'Make IT', tipo: 'Construtora', cor: '#ef7622',
    logo: '/static/img/logo-makeit.png',
    desc: 'Execução de obra: além do acompanhamento, controla produção semanal, restrições, produtividade, histograma e consumo.',
  },
};

const AMBAS = ['gadens', 'makeit'];

/* escopo: 'portfolio' (todas as obras), 'obra' (usa o seletor de obra) ou 'sistema'. */
export const MENU = [
  { grupo: 'Visão geral', itens: [
    { chave: 'consolidado', rotulo: 'Consolidado', escopo: 'portfolio', empresas: AMBAS, icone: 'painel' },
  ] },
  { grupo: 'Análise por obra', itens: [
    { chave: 'visao', rotulo: 'Visão geral da obra', escopo: 'obra', empresas: AMBAS, icone: 'obra' },
    { chave: 'fisica', rotulo: 'Evolução física', escopo: 'obra', empresas: AMBAS, icone: 'grafico' },
    { chave: 'cronograma', rotulo: 'Cronograma', escopo: 'obra', empresas: AMBAS, icone: 'gantt' },
    { chave: 'atrasos', rotulo: 'Atrasos', escopo: 'obra', empresas: AMBAS, icone: 'relogio' },
    { chave: 'custos', rotulo: 'Custos', escopo: 'obra', empresas: AMBAS, icone: 'moeda', tag: ['parcial', 'parcial'] },
    { chave: 'medicoes', rotulo: 'Medições', escopo: 'obra', empresas: AMBAS, icone: 'regua' },
  ] },
  { grupo: 'Produção e Lean', itens: [
    { chave: 'lean', rotulo: 'Semanal e Lean', escopo: 'obra', empresas: ['makeit'], icone: 'semana' },
    { chave: 'produtividade', rotulo: 'Produtividade', escopo: 'obra', empresas: ['makeit'], icone: 'raio' },
    { chave: 'restricoes', rotulo: 'Restrições', escopo: 'portfolio', empresas: ['makeit'], icone: 'alerta' },
    { chave: 'histograma', rotulo: 'Histograma de obras', escopo: 'obra', empresas: ['makeit'], icone: 'histograma', tag: ['excel', 'Excel'] },
    { chave: 'consumo', rotulo: 'Controle de consumo', escopo: 'obra', empresas: ['makeit'], icone: 'caixa', tag: ['excel', 'Excel'] },
  ] },
  { grupo: 'Incorporação', itens: [
    { chave: 'incorporacao', rotulo: 'Incorporação', escopo: 'sistema', empresas: ['gadens'], icone: 'predio', tag: ['token', 'Token'] },
  ] },
  { grupo: 'Mega', itens: [
    { chave: 'mega_compras', rotulo: 'Follow up de compras', escopo: 'obra', empresas: AMBAS, icone: 'carrinho' },
    { chave: 'mega_nivel', rotulo: 'Custo por nível', escopo: 'sistema', empresas: AMBAS, icone: 'camadas', tag: ['mega', 'Mega'] },
    { chave: 'mega_crystal', rotulo: 'Realizado (Crystal)', escopo: 'obra', empresas: AMBAS, icone: 'relatorio' },
    { chave: 'mega_contratos', rotulo: 'Contratos e medições', escopo: 'sistema', empresas: AMBAS, icone: 'contrato', tag: ['mega', 'Mega'] },
  ] },
  { grupo: 'Sistema', itens: [
    { chave: 'integracoes', rotulo: 'Integrações', escopo: 'sistema', empresas: AMBAS, icone: 'plug' },
    { chave: 'configuracoes', rotulo: 'Configurações', escopo: 'sistema', empresas: AMBAS, icone: 'engrenagem' },
  ] },
];

export const ICONES = {
  painel: '<path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z"/>',
  obra: '<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M9 11h.01M15 11h.01"/>',
  grafico: '<path d="M3 3v18h18M7 15l4-5 4 3 5-7"/>',
  gantt: '<path d="M4 6h9M7 12h12M10 18h8"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  moeda: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5c-.4-1-1.4-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.500 2c-1.100 0-2.100-.5-2.500-1.500M12 6v2m0 8v2"/>',
  regua: '<path d="M3 17 17 3l4 4L7 21l-4-4Zm5-5 2 2m1-5 2 2m-7 1 2 2"/>',
  semana: '<path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/>',
  raio: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  alerta: '<path d="M12 3 2 20h20L12 3Zm0 6v5m0 3h.01"/>',
  histograma: '<path d="M4 20V10m5 10V4m5 16v-8m5 8V7"/>',
  caixa: '<path d="m21 8-9-5-9 5v8l9 5 9-5V8ZM3 8l9 5m0 0 9-5m-9 5v9"/>',
  predio: '<path d="M4 21V5l8-2v18M12 9l8 2v10M4 21h16M8 8h.01M8 12h.01M8 16h.01M16 15h.01M16 18h.01"/>',
  carrinho: '<path d="M3 4h2l2.4 11h10.200L20 8H6.500M10 20h.01M17 20h.01"/>',
  camadas: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 4 9 5 9-5"/>',
  relatorio: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8M8 17h5"/>',
  contrato: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6m-9 6 2 2 4-4"/>',
  plug: '<path d="M9 2v6m6-6v6M6 8h12v4a6 6 0 0 1-12 0V8Zm6 10v4"/>',
  engrenagem: '<circle cx="12" cy="12" r="3"/><path d="M19.400 15a1.700 1.700 0 0 0 .3 1.800l.1.1a2 2 0 1 1-2.800 2.800l-.1-.1a1.700 1.700 0 0 0-1.800-.3 1.700 1.700 0 0 0-1 1.500V21a2 2 0 1 1-4 0v-.1a1.700 1.700 0 0 0-1.100-1.500 1.700 1.700 0 0 0-1.800.3l-.1.1a2 2 0 1 1-2.800-2.800l.1-.1a1.700 1.700 0 0 0 .3-1.800 1.700 1.700 0 0 0-1.500-1H3a2 2 0 1 1 0-4h.1a1.700 1.700 0 0 0 1.500-1.100 1.700 1.700 0 0 0-.3-1.800l-.1-.1a2 2 0 1 1 2.800-2.800l.1.100a1.700 1.700 0 0 0 1.800.3H9a1.700 1.700 0 0 0 1-1.500V3a2 2 0 1 1 4 0v.1a1.700 1.700 0 0 0 1 1.500 1.700 1.700 0 0 0 1.800-.3l.1-.1a2 2 0 1 1 2.800 2.800l-.1.1a1.700 1.700 0 0 0-.3 1.800V9a1.700 1.700 0 0 0 1.500 1H21a2 2 0 1 1 0 4h-.1a1.700 1.700 0 0 0-1.500 1Z"/>',
};

export const itensDaEmpresa = (empresa) =>
  MENU.map((g) => ({ ...g, itens: g.itens.filter((i) => i.empresas.includes(empresa)) })).filter((g) => g.itens.length);

export const todosItens = () => MENU.flatMap((g) => g.itens);
