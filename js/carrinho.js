import { dinheiro, linhas } from "./texto.js";

export function itemOficial(item) {
  if (!item || !/^[a-z0-9-]{1,48}$/.test(item.id || "")) return null;
  const oficial = window.loja.atividades.find((atividade) => atividade.id === item.id);
  if (!oficial) return null;
  const preco = Number(oficial.preco);
  if (!Number.isFinite(preco) || preco <= 0) return null;
  return {
    id: oficial.id,
    titulo: oficial.titulo,
    preco,
    resumo: oficial.resumo || "",
    inclui: Array.isArray(oficial.inclui) ? oficial.inclui : linhas(oficial.inclui),
  };
}

export function lerCarrinho() {
  try {
    const itens = JSON.parse(sessionStorage.getItem("carrinho") || "[]");
    if (!Array.isArray(itens)) return [];
    return itens.map(itemOficial).filter(Boolean);
  } catch {
    return [];
  }
}

function gravarCarrinho(itens) {
  sessionStorage.setItem("carrinho", JSON.stringify(itens));
  pintarCarrinho();
}

export function guardarNoCarrinho(atividade) {
  const itens = lerCarrinho().filter((item) => item.id !== atividade.id);
  itens.push({
    id: atividade.id,
    titulo: atividade.titulo,
    preco: Number(atividade.preco),
    resumo: atividade.resumo || "",
    inclui: Array.isArray(atividade.inclui) ? atividade.inclui : linhas(atividade.inclui),
  });
  gravarCarrinho(itens);
}

export function tirarDoCarrinho(id) {
  gravarCarrinho(lerCarrinho().filter((item) => item.id !== id));
}

export function limparCarrinho() {
  sessionStorage.removeItem("carrinho");
  pintarCarrinho();
}

export function rotuloAdicionar(id) {
  return lerCarrinho().some((item) => item.id === id) ? "No carrinho" : "Adicionar ao carrinho";
}

export function pedidoDoCarrinho() {
  const itens = lerCarrinho();
  if (!itens.length) return null;
  const total = Number(itens.reduce((soma, item) => soma + Number(item.preco), 0).toFixed(2));
  return {
    titulo: itens.length === 1 ? itens[0].titulo : `${itens.length} atividades`,
    resumo: itens.length === 1 ? itens[0].resumo : "",
    inclui: itens.length === 1 ? itens[0].inclui : itens.map((item) => item.titulo),
    preco: total,
    itens,
  };
}

export function pintarCarrinho() {
  const itens = lerCarrinho();
  const qtd = document.querySelector("#carrinho-qtd");
  if (qtd) {
    qtd.textContent = itens.length ? String(itens.length) : "";
    qtd.hidden = itens.length === 0;
  }
  document.querySelectorAll(".adicionar-carrinho").forEach((botao) => {
    if (botao.dataset.id) botao.textContent = rotuloAdicionar(botao.dataset.id);
  });
  const comprar = document.querySelector("#comprar");
  if (comprar?.dataset.id) comprar.textContent = rotuloAdicionar(comprar.dataset.id);

  const lista = document.querySelector("#carrinho-lista");
  const vazio = document.querySelector("#carrinho-vazio");
  const total = document.querySelector("#carrinho-total");
  const finalizar = document.querySelector("#carrinho-finalizar");
  const limpar = document.querySelector("#carrinho-limpar");
  if (!lista) return;
  lista.replaceChildren();
  itens.forEach((item) => {
    const li = document.createElement("li");
    li.className = "carrinho-item";
    const texto = document.createElement("div");
    const nome = document.createElement("strong");
    nome.textContent = item.titulo;
    const preco = document.createElement("span");
    preco.textContent = dinheiro(item.preco);
    texto.append(nome, preco);
    const tirar = document.createElement("button");
    tirar.type = "button";
    tirar.className = "tirar";
    tirar.textContent = "Excluir";
    tirar.addEventListener("click", () => tirarDoCarrinho(item.id));
    li.append(texto, tirar);
    lista.append(li);
  });
  const soma = itens.reduce((acumulado, item) => acumulado + Number(item.preco), 0);
  if (vazio) vazio.hidden = itens.length > 0;
  lista.hidden = itens.length === 0;
  if (total) {
    total.hidden = itens.length === 0;
    total.textContent = dinheiro(soma);
  }
  if (finalizar) finalizar.disabled = itens.length === 0;
  if (limpar) limpar.disabled = itens.length === 0;
}

export function abrirCarrinho() {
  pintarCarrinho();
  const caixa = document.querySelector("#carrinho");
  if (caixa && !caixa.open) caixa.showModal();
}

function continuarComprando() {
  document.querySelector("#carrinho")?.close();
  const destino = document.querySelector("#atividades");
  if (destino) {
    destino.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  location.href = "index.html#atividades";
}

export function prepararCarrinho(aoFinalizar) {
  document.querySelector("#abre-carrinho")?.addEventListener("click", abrirCarrinho);
  document.querySelector("#carrinho .fechar")?.addEventListener("click", () => {
    document.querySelector("#carrinho")?.close();
  });
  document.querySelector("#carrinho-finalizar")?.addEventListener("click", () => {
    const pedido = pedidoDoCarrinho();
    if (!pedido) return;
    document.querySelector("#carrinho")?.close();
    aoFinalizar(pedido);
  });
  document.querySelector("#carrinho-continuar")?.addEventListener("click", continuarComprando);
  document.querySelector("#carrinho-limpar")?.addEventListener("click", limparCarrinho);
  pintarCarrinho();
  if (new URLSearchParams(location.search).get("carrinho") === "1") abrirCarrinho();
}
