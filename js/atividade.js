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
  const imagem = amostra?.querySelector("img");
  if (amostra && imagem && atividade.capa) {
    amostra.hidden = false;
    imagem.src = atividade.capa;
    imagem.alt = atividade.capaAlt || "";
  } else if (amostra) {
    amostra.hidden = true;
  }
  const informacoes = Array.isArray(atividade.informacoes) ? atividade.informacoes.filter((item) => item?.[0] && item?.[1]) : [];
  const tituloInfo = document.querySelector("#ficha-info-titulo");
  const fichaInfo = document.querySelector("#ficha-info");
  if (tituloInfo && fichaInfo) {
    tituloInfo.hidden = informacoes.length === 0;
    fichaInfo.hidden = informacoes.length === 0;
    fichaInfo.replaceChildren();
    informacoes.forEach(([rotulo, valor]) => {
      const linha = document.createElement("div");
      const termo = document.createElement("dt");
      const descricao = document.createElement("dd");
      termo.textContent = rotulo;
      descricao.textContent = valor;
      linha.append(termo, descricao);
      fichaInfo.append(linha);
    });
  }
  const extra = document.querySelector("#ficha-extra");
  const inclui = linhasDaPagina(atividade.inclui);
  extra.textContent = inclui[0] || "Para imprimir.";
  const comprar = document.querySelector("#comprar");
  comprar.dataset.id = atividade.id;
  comprar.textContent = rotuloAdicionar(atividade.id);
  comprar.onclick = () => {
    guardarNoCarrinho({
      id: atividade.id,
      titulo: atividade.titulo,
      resumo: atividade.resumo,
      inclui,
      preco: Number(atividade.preco),
    });
    abrirCarrinho();
  };
}

function fichaLocal() {
  const id = new URLSearchParams(location.search).get("id") || "adicao";
  const item = loja.atividades.find((atividade) => atividade.id === id);
  if (!item) return null;
  if (item.explicacao) {
    return {
      ...item,
      inclui: Array.isArray(item.inclui) ? item.inclui.join("\n") : item.inclui,
      arquivo: item.download,
    };
  }
  if (id !== "adicao") return null;
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
    if (remota) {
      preencherFicha({
        ...local,
        ...remota,
        capa: remota.capa || local?.capa,
        capaAlt: remota.capaAlt || local?.capaAlt,
        explicacao: remota.explicacao || local?.explicacao,
        habilidades: remota.habilidades || local?.habilidades,
        informacoes: (Array.isArray(remota.informacoes) && remota.informacoes.length) ? remota.informacoes : local?.informacoes,
      });
    }
  } catch {
    if (!local) document.querySelector("#ficha-titulo").textContent = "Esta atividade não está disponível.";
  }
});
