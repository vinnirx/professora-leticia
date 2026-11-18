export function destinoDaLoja(atual, referenciador) {
  const aqui = new URL(atual);
  const inicio = new URL("../", aqui);
  const recusar = { href: inicio.href, historico: false };
  if (!referenciador) return recusar;
  let origem;
  try {
    origem = new URL(referenciador);
  } catch {
    return recusar;
  }
  if (origem.protocol !== "http:" && origem.protocol !== "https:") return recusar;
  if (origem.origin !== aqui.origin) return recusar;
  if (origem.pathname === aqui.pathname && origem.search === aqui.search) return recusar;
  return { href: origem.href, historico: true };
}

export function acaoVoltar(destino, historico) {
  if (!destino?.historico) return "inicio";
  return Number(historico) > 1 ? "historico" : "referenciador";
}

function ligarVolta() {
  const botao = document.querySelector("[data-voltar-loja]");
  if (!botao) return;
  const destino = destinoDaLoja(location.href, document.referrer);
  botao.addEventListener("click", (evento) => {
    const acao = acaoVoltar(destino, history.length);
    if (acao === "historico") {
      evento.preventDefault();
      history.back();
      return;
    }
    if (acao === "referenciador") {
      evento.preventDefault();
      location.assign(destino.href);
    }
  });
}

if (typeof document !== "undefined") ligarVolta();
