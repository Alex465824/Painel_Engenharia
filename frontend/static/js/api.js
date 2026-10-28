/* Cliente HTTP minimo. Erros viram Error com a mensagem em portugues vinda do backend. */

async function requisitar(metodo, url, corpo) {
  const opcoes = { method: metodo, headers: {} };
  if (corpo instanceof FormData) {
    opcoes.body = corpo;
  } else if (corpo !== undefined) {
    opcoes.headers['Content-Type'] = 'application/json';
    opcoes.body = JSON.stringify(corpo);
  }
  let resp;
  try {
    resp = await fetch(url, opcoes);
  } catch {
    throw new Error('Não foi possível falar com o servidor do painel. Verifique se ele está em execução.');
  }
  if (resp.status === 204) return null;
  const tipo = resp.headers.get('content-type') || '';
  const dados = tipo.includes('json') ? await resp.json() : await resp.text();
  if (!resp.ok) {
    const detalhe = dados && dados.detail ? dados.detail : dados;
    throw new Error(typeof detalhe === 'string' ? detalhe : `Erro ${resp.status}`);
  }
  return dados;
}

export const api = {
  get: (url) => requisitar('GET', url),
  post: (url, corpo) => requisitar('POST', url, corpo),
  put: (url, corpo) => requisitar('PUT', url, corpo),
  del: (url) => requisitar('DELETE', url),
};
