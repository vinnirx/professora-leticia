function linhasDaPagina(texto) {
  return String(texto || "").split(/\n+/).map((item) => item.trim()).filter(Boolean);
}

function preencherFicha(atividade) {
  document.querySelector("#ficha-uso").textContent = atividade.uso || "AEE e sala regular";
  document.querySelector("#ficha-titulo").textContent = atividade.titulo;
  document.title = `${atividade.titulo} — Inclusão no Cotidiano`;
  document.querySelectorAll("[data-preco]").forEach((elemento) => {
    elemento.textContent = dinheiro(atividade.preco);
  });
  const texto = document.querySelector("#ficha-texto");
  texto.replaceChildren();
  linhasDaPagina(atividade.explicacao).forEach((paragrafo) => {
    const p = document.createElement("p");
    p.textContent = paragrafo;
    texto.append(p);
  });
  const habilidades = linhasDaPagina(atividade.habilidades);
  const tituloHabilidades = document.querySelector("#ficha-habilidades-titulo");
  const lista = document.querySelector("#ficha-habilidades");
  tituloHabilidades.hidden = habilidades.length === 0;
  lista.hidden = habilidades.length === 0;
  lista.replaceChildren();
  habilidades.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    lista.append(li);
  });
  const amostra = document.querySelector("#ficha-amostra");
  if (amostra) amostra.hidden = atividade.id !== "adicao";
  const extra = document.querySelector("#ficha-extra");
  const inclui = linhasDaPagina(atividade.inclui);
  extra.textContent = inclui[0] || "Para imprimir.";
  document.querySelector("#comprar").onclick = () => abrirPix({
    id: atividade.id,
    titulo: atividade.titulo,
    resumo: atividade.resumo,
    inclui,
    preco: Number(atividade.preco),
    download: atividade.arquivo || atividade.download,
  });
}

function fichaLocal() {
  const id = new URLSearchParams(location.search).get("id") || "adicao";
  const item = loja.atividades.find((atividade) => atividade.id === id);
  if (!item || id !== "adicao") return null;
  return {
    ...item,
    explicacao: [...document.querySelectorAll("#ficha-texto p")].map((p) => p.textContent).join("\n"),
    habilidades: [...document.querySelectorAll("#ficha-habilidades li")].map((li) => li.textContent).join("\n"),
    inclui: item.inclui.join("\n"),
    arquivo: item.download,
  };
}

document.addEventListener("DOMContentLoaded", async () => {
  const bruto = new URLSearchParams(location.search).get("id") || "adicao";
  const id = /^[a-z0-9-]{1,48}$/.test(bruto) ? bruto : "";
  const local = fichaLocal();
  if (local) preencherFicha(local);
  if (!id) return;
  if (!window.contaPronta) return;
  const conta = await window.contaPronta;
  if (!conta?.configurada) return;
  try {
    const remota = await conta.atividade(id);
    if (remota) preencherFicha(remota);
  } catch {
    if (!local) document.querySelector("#ficha-titulo").textContent = "Esta atividade não está disponível.";
  }
});
