const SECOES = new Set(["entrar", "criar-conta", "minha-conta", "gerenciar", "recuperar-senha", "atividades"]);

export function emSecao(pathname) {
  const partes = String(pathname || "/").split("/").filter(Boolean);
  const ultima = partes.at(-1) || "";
  if (!ultima || ultima.includes(".")) return false;
  return SECOES.has(ultima);
}

export function prefixo(pathname = typeof location === "undefined" ? "/" : location.pathname) {
  return emSecao(pathname) ? "../" : "";
}

export function rota(nome, pathname = typeof location === "undefined" ? "/" : location.pathname) {
  const base = prefixo(pathname);
  if (nome === "inicio") return base ? "../" : "./";
  return `${base}${nome}`;
}

export function paginaAtividade(id, pathname = typeof location === "undefined" ? "/" : location.pathname) {
  return `${prefixo(pathname)}atividade.html?id=${encodeURIComponent(id)}`;
}

export function destinoInterno(valor, pathname = typeof location === "undefined" ? "/" : location.pathname) {
  const pedido = String(valor || "");
  if (pedido === "index.html?carrinho=1" || pedido === "?carrinho=1") return `${rota("inicio", pathname)}?carrinho=1`;
  if (/^atividade\.html\?id=[a-z0-9-]{1,48}$/.test(pedido)) return `${prefixo(pathname)}${pedido}`;
  const apelidos = {
    "minhas.html": "minha-conta/",
    "admin.html": "gerenciar/",
    "entrar.html": "entrar/",
    "index.html": "inicio",
    "index.html#atividades": "atividades/",
    "minha-conta/": "minha-conta/",
    "gerenciar/": "gerenciar/",
    "entrar/": "entrar/",
    "criar-conta/": "criar-conta/",
    "recuperar-senha/": "recuperar-senha/",
    "atividades/": "atividades/",
  };
  const nome = apelidos[pedido] || "minha-conta/";
  return rota(nome, pathname);
}

export function destinoLegado(pagina, destino, hash = "", search = "") {
  const recuperacao = String(hash).includes("type=recovery") || String(hash).includes("error_code=");
  const origem = String(pagina || "");
  if (recuperacao && (destino === "entrar/" || origem.endsWith("entrar.html") || origem.endsWith("/entrar/"))) {
    return `recuperar-senha/${search}${hash}`;
  }
  return `${destino}${search}${hash}`;
}
