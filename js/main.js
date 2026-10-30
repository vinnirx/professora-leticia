const grade = document.querySelector("#grade");
const dialogo = document.querySelector("#pix");
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const capas = {
  "Casa e sala": "capa-ceu",
  Comunicação: "capa-sol",
  Matemática: "capa-verde",
  Emoções: "capa-coral",
  Leitura: "capa-azul",
  Pacote: "capa-pessego",
};

function dinheiro(valor) {
  return moeda.format(valor);
}

function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (caractere) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[caractere]);
}

function linhas(texto) {
  return String(texto || "").split(/\n+/).map((item) => item.trim()).filter(Boolean);
}

function paraCartao(item) {
  return {
    id: item.id,
    titulo: item.titulo,
    uso: item.uso || "AEE e sala regular",
    resumo: item.resumo || "",
    inclui: Array.isArray(item.inclui) ? item.inclui : linhas(item.inclui),
    preco: Number(item.preco),
    download: item.arquivo || item.download,
    pagina: `atividade.html?id=${encodeURIComponent(item.id)}`,
    area: item.area || (item.id === "adicao" ? "Matemática" : ""),
    temas: Array.isArray(item.temas) && item.temas.length ? [...new Set(item.temas)] : item.id === "adicao" ? ["Situações-Problema"] : [],
    explicacao: item.explicacao || "",
    habilidades: Array.isArray(item.habilidades) ? item.habilidades : linhas(item.habilidades),
    capa: item.capa || "",
    capaAlt: item.capaAlt || "",
  };
}

function cartao(atividade) {
  const artigo = document.createElement("article");
  artigo.className = "card";
  artigo.innerHTML = `
    <div class="amostra amostra-capa">
      <img src="${escapar(atividade.capa)}" alt="${escapar(atividade.capaAlt)}" />
    </div>
    <div class="oferta">
      <p class="chapeu">${escapar(atividade.uso)}</p>
      <h3><a href="${atividade.pagina}">${escapar(atividade.titulo)}</a></h3>
      <p class="resumo">${escapar(atividade.resumo)}</p>
      <ul class="inclui">
        ${(atividade.inclui || []).map((item) => `<li>${escapar(item)}</li>`).join("")}
      </ul>
      <p class="preco">${dinheiro(atividade.preco)}</p>
      <a class="botao comprar" href="${atividade.pagina}">Ver Atividade</a>
      <button class="botao botao-secundario adicionar-carrinho" type="button">Adicionar ao carrinho</button>
    </div>
  `;
  if (!atividade.capa) artigo.querySelector(".amostra")?.remove();
  if (!(atividade.inclui || []).length) artigo.querySelector(".inclui")?.remove();
  const adicionar = artigo.querySelector(".adicionar-carrinho");
  adicionar.dataset.id = atividade.id;
  adicionar.addEventListener("click", () => {
    guardarNoCarrinho(atividade);
    abrirCarrinho();
  });
  return artigo;
}

let pixAtual = "";

async function abrirPix(atividade) {
  const lojaConta = window.contaPronta ? await window.contaPronta : null;
  const ligada = Boolean(lojaConta?.configurada);
  let sessao = null;
  if (ligada) {
    sessao = await lojaConta.sessao();
    if (!sessao) {
      const volta = "index.html?carrinho=1";
      sessionStorage.setItem("depois", volta);
      location.href = `entrar.html?depois=${encodeURIComponent(volta)}`;
      return;
    }
  }

  const itens = Array.isArray(atividade.itens) && atividade.itens.length ? atividade.itens : [atividade];
  const total = itens.reduce((soma, item) => soma + Number(item.preco), 0);

  const pedido = document.querySelector("#pix-pedido");
  const resultado = document.querySelector("#pix-resultado");
  const aviso = document.querySelector("#pix-aviso");
  const copiar = document.querySelector("#copiar");
  const whatsapp = document.querySelector("#whatsapp");
  const nomeInput = pedido.querySelector('[name="nome"]');
  const emailInput = pedido.querySelector('[name="email"]');

  document.querySelector("#pix-titulo").textContent = atividade.titulo;
  document.querySelector("#pix-preco").textContent = dinheiro(total);
  document.querySelector("#pix-resumo").hidden = !atividade.resumo;
  document.querySelector("#pix-resumo").textContent = atividade.resumo || "";
  document.querySelector("#pix-inclui").hidden = !(atividade.inclui || []).length;
  document.querySelector("#pix-inclui").innerHTML = (atividade.inclui || []).map((item) => `<li>${escapar(item)}</li>`).join("");
  pedido.reset();
  nomeInput.readOnly = false;
  emailInput.readOnly = false;
  if (sessao) {
    const perfil = await lojaConta.perfil();
    nomeInput.value = perfil?.nome || "";
    emailInput.value = sessao.user.email || "";
    nomeInput.readOnly = true;
    emailInput.readOnly = true;
  }
  pedido.hidden = !loja.pixChave;
  resultado.hidden = true;
  pixAtual = "";
  whatsapp.hidden = true;
  whatsapp.removeAttribute("href");
  aviso.textContent = loja.pixChave
    ? "O QR leva um código deste pedido. A Letícia vê esse código no banco dela. Esta página não recebe aviso do pagamento."
    : "A chave Pix ainda não foi cadastrada. Quando a Letícia passar a chave, o QR aparece aqui.";

  pedido.onsubmit = async (evento) => {
    evento.preventDefault();
    if (!loja.pixChave) return;
    const dados = new FormData(pedido);
    const nome = String(dados.get("nome") || "").trim();
    const email = String(dados.get("email") || "").trim();
    const txid = identificadorPix();
    if (ligada) {
      const ids = itens.map((item) => item.id);
      const gravado = ids.length > 1
        ? await lojaConta.registrarPedidos(ids, txid)
        : await lojaConta.registrarPedido(ids[0], txid);
      if (!gravado.ok) {
        aviso.textContent = gravado.mensagem;
        return;
      }
    }
    pixAtual = montarPix({
      chave: loja.pixChave,
      nome: loja.pixNome,
      cidade: loja.pixCidade,
      valor: total,
      txid,
    });
    document.querySelector("#pix-imagem").innerHTML = qrSvg(pixAtual);
    document.querySelector("#pix-codigo").textContent = txid;
    document.querySelector("#pix-pessoa").textContent = `${nome} · ${email}`;
    document.querySelector("#pix-cola").value = pixAtual;
    document.querySelector("#pix-resumo").hidden = true;
    document.querySelector("#pix-inclui").hidden = true;
    pedido.hidden = true;
    resultado.hidden = false;
    limparCarrinho();
    aviso.textContent = `Pague ${dinheiro(total)} e envie o comprovante com este código. Quando a Letícia confirmar o Pix, o download aparece em Minha conta.`;
    if (loja.whatsapp) {
      const nomes = itens.map((item) => item.titulo).join(", ");
      const texto = encodeURIComponent(
        `Olá, Letícia. Segue o comprovante do Pix de ${nomes} (${dinheiro(total)}). Código do pedido: ${txid}. Meu e-mail: ${email}.`,
      );
      whatsapp.hidden = false;
      whatsapp.href = `https://wa.me/${loja.whatsapp}?text=${texto}`;
    }
  };

  copiar.onclick = async () => {
    if (!pixAtual) return;
    const campo = document.querySelector("#pix-cola");
    try {
      await navigator.clipboard.writeText(pixAtual);
      aviso.textContent = "Pix copiado. Cole no aplicativo do banco. O download entra em Minha conta quando a Letícia confirmar.";
    } catch {
      campo.focus();
      campo.select();
      aviso.textContent = "Não foi possível copiar sozinho. O código está selecionado para você copiar.";
    }
  };

  dialogo.showModal();
}

if (dialogo) {
  document.querySelector("#pix .fechar").addEventListener("click", () => dialogo.close());
}

document.addEventListener("DOMContentLoaded", () => {
  prepararCarrinho();
  prepararAreas();
  montarLoja();
});

let areaEscolhida = "";
let temaEscolhido = "";

const temasPorArea = {
  Matemática: [
    "Números e Quantidades",
    "Sequência Numérica",
    "Antecessor e Sucessor",
    "Adição",
    "Subtração",
    "Multiplicação",
    "Divisão",
    "Situações-Problema",
    "Sistema de Numeração Decimal",
    "Composição e Decomposição Numérica",
    "Formas Geométricas",
    "Medidas e Grandezas",
    "Sistema Monetário",
    "Frações",
  ],
};

function prepararAreas() {
  const botao = document.querySelector(".abre-areas");
  const painel = document.querySelector("#areas-atividade");
  const coluna = document.querySelector("#subareas-coluna");
  const subareas = document.querySelector("#subareas-atividade");
  if (!botao || !painel || !coluna || !subareas) return;
  const grupoTemas = subareas.querySelector('[role="group"]');
  const seta = coluna.querySelector(".subareas-mais");

  const atualizarSeta = () => {
    if (!seta || coluna.hidden) return;
    if (subareas.querySelector(".subareas-vazio")) {
      coluna.style.maxHeight = "none";
      seta.hidden = true;
      const cartaz = coluna.getBoundingClientRect();
      if (cartaz.bottom > window.innerHeight - 8) {
        window.scrollBy(0, cartaz.bottom - window.innerHeight + 12);
      }
      return;
    }
    const topo = coluna.getBoundingClientRect().top;
    const disponivel = window.innerHeight - topo - 12;
    coluna.style.maxHeight = `${Math.min(352, Math.max(120, disponivel))}px`;
    if (subareas.clientHeight === 0) return;
    const falta = subareas.scrollHeight - subareas.clientHeight - subareas.scrollTop;
    seta.hidden = falta < 8;
    const caixa = coluna.getBoundingClientRect();
    if (caixa.bottom > window.innerHeight - 8) {
      window.scrollBy(0, caixa.bottom - window.innerHeight + 12);
    }
  };

  seta?.addEventListener("click", (evento) => {
    evento.stopPropagation();
    subareas.scrollTop += 140;
    atualizarSeta();
  });
  subareas.addEventListener("scroll", atualizarSeta);
  window.addEventListener("resize", atualizarSeta);
  window.addEventListener("scroll", atualizarSeta, true);

  const fechar = () => {
    botao.setAttribute("aria-expanded", "false");
    painel.hidden = true;
    coluna.hidden = true;
    painel.querySelectorAll("[data-area]").forEach((item) => item.setAttribute("aria-expanded", "false"));
  };

  const pintarTemas = () => {
    grupoTemas.querySelectorAll("button").forEach((item) => {
      item.setAttribute("aria-pressed", String(item.dataset.tema === temaEscolhido));
    });
  };

  const abrirTemas = (area) => {
    grupoTemas.replaceChildren();
    const temas = [...new Set(temasPorArea[area] || [])];
    if (!temas.length) {
      const aviso = document.createElement("p");
      aviso.className = "subareas-vazio";
      const imagem = document.createElement("img");
      imagem.src = "img/em-breve.jpg?v=1";
      imagem.alt = "Em Breve";
      aviso.append(imagem);
      grupoTemas.append(aviso);
    } else {
      temas.forEach((tema) => {
        const item = document.createElement("button");
        item.type = "button";
        item.dataset.tema = tema;
        item.textContent = tema;
        item.setAttribute("aria-pressed", String(areaEscolhida === area && temaEscolhido === tema));
        item.addEventListener("click", () => {
          temaEscolhido = temaEscolhido === tema && areaEscolhida === area ? "" : tema;
          areaEscolhida = temaEscolhido ? area : "";
          pintarTemas();
          mostrarCatalogo();
          fechar();
          if (temaEscolhido) document.querySelector("#atividades")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        grupoTemas.append(item);
      });
    }
    coluna.hidden = false;
    subareas.scrollTop = 0;
    requestAnimationFrame(() => requestAnimationFrame(atualizarSeta));
    setTimeout(atualizarSeta, 60);
    painel.querySelectorAll("[data-area]").forEach((item) => {
      const aberto = item.dataset.area === area;
      item.setAttribute("aria-expanded", String(aberto));
      item.setAttribute("aria-pressed", String(aberto && areaEscolhida === area));
    });
  };

  botao.addEventListener("click", (evento) => {
    evento.stopPropagation();
    const aberto = botao.getAttribute("aria-expanded") === "true";
    if (aberto) fechar();
    else {
      botao.setAttribute("aria-expanded", "true");
      painel.hidden = false;
      coluna.hidden = true;
    }
  });

  painel.addEventListener("click", (evento) => evento.stopPropagation());
  document.addEventListener("click", fechar);
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") fechar();
  });

  painel.querySelectorAll("[data-area]").forEach((item) => {
    item.addEventListener("click", () => abrirTemas(item.dataset.area));
  });
}

let catalogo = [];

function textoBusca(atividade) {
  return [
    atividade.titulo,
    atividade.resumo,
    atividade.uso,
    atividade.area,
    ...(atividade.temas || []),
    ...(atividade.inclui || []),
  ]
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function mostrarCatalogo() {
  if (!grade) return;
  const campo = document.querySelector("#busca-atividade");
  const termo = campo?.value.trim() || "";
  const normal = termo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visiveis = catalogo.filter((item) => {
    const cabeBusca = !normal || textoBusca(item).includes(normal);
    if (normal) return cabeBusca;
    const cabeArea = !areaEscolhida || item.area === areaEscolhida;
    const cabeTema = !temaEscolhido || (item.temas || []).includes(temaEscolhido);
    return cabeArea && cabeTema;
  });
  grade.replaceChildren();
  visiveis.forEach((atividade) => grade.append(cartao(atividade)));
  mostrarSugestoes(visiveis, termo);
  const vazio = document.querySelector("#busca-vazia");
  const aviso = document.querySelector("#busca-vazia-texto");
  const cartaz = vazio?.querySelector("img");
  if (vazio && aviso && cartaz) {
    const semConteudo = !visiveis.length && !normal && Boolean(temaEscolhido || areaEscolhida);
    vazio.hidden = visiveis.length > 0;
    vazio.classList.toggle("em-breve", semConteudo);
    cartaz.hidden = !semConteudo;
    aviso.hidden = semConteudo || visiveis.length > 0;
    if (!visiveis.length && !semConteudo) aviso.textContent = `Nenhuma atividade com “${termo}”.`;
  }
  const voltar = document.querySelector("#voltar-destaque");
  if (voltar) voltar.hidden = !vazio?.classList.contains("em-breve") || vazio.hidden;
  pintarCarrinho();
}

function mostrarSugestoes(visiveis, termo) {
  const lista = document.querySelector("#sugestoes");
  if (!lista) return;
  lista.replaceChildren();
  if (!termo) {
    lista.hidden = true;
    return;
  }
  visiveis.forEach((atividade) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = atividade.pagina;
    link.textContent = atividade.titulo;
    const preco = document.createElement("span");
    preco.textContent = dinheiro(atividade.preco);
    link.append(preco);
    item.append(link);
    lista.append(item);
  });
  lista.hidden = visiveis.length === 0;
}

async function montarLoja() {
  if (!grade) return;
  const locais = loja.atividades.map(paraCartao);
  catalogo = locais;
  document.querySelector("#busca-atividade")?.addEventListener("input", mostrarCatalogo);
  document.querySelector("#voltar-destaque")?.addEventListener("click", () => {
    areaEscolhida = "";
    temaEscolhido = "";
    document.querySelectorAll("[data-area], [data-tema]").forEach((item) => {
      item.setAttribute("aria-pressed", "false");
      if (item.hasAttribute("aria-expanded")) item.setAttribute("aria-expanded", "false");
    });
    mostrarCatalogo();
    document.querySelector("#atividades")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  mostrarCatalogo();
  if (!window.contaPronta) return;
  try {
    const conta = await window.contaPronta;
    if (!conta?.configurada) return;
    const remotas = await conta.atividades();
    if (!remotas.length) return;
    const vindas = remotas.map(paraCartao);
    const locaisPorId = new Map(locais.map((item) => [item.id, item]));
    const ids = new Set(vindas.map((item) => item.id));
    catalogo = [
      ...vindas.map((item) => {
        const local = locaisPorId.get(item.id);
        if (!local) return item;
        return {
          ...item,
          area: item.area || local.area,
          temas: item.temas.length ? item.temas : local.temas,
          capa: item.capa || local.capa,
          capaAlt: item.capaAlt || local.capaAlt,
          explicacao: item.explicacao || local.explicacao,
          habilidades: item.habilidades.length ? item.habilidades : local.habilidades,
        };
      }),
      ...locais.filter((item) => !ids.has(item.id)),
    ];
    mostrarCatalogo();
  } catch {
    catalogo = locais;
    mostrarCatalogo();
  }
}

function lerCarrinho() {
  try {
    const itens = JSON.parse(sessionStorage.getItem("carrinho") || "[]");
    if (!Array.isArray(itens)) return [];
    return itens.filter((item) => item && /^[a-z0-9-]{1,48}$/.test(item.id) && item.titulo);
  } catch {
    return [];
  }
}

function gravarCarrinho(itens) {
  sessionStorage.setItem("carrinho", JSON.stringify(itens));
  pintarCarrinho();
}

function guardarNoCarrinho(atividade) {
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

function tirarDoCarrinho(id) {
  gravarCarrinho(lerCarrinho().filter((item) => item.id !== id));
}

function limparCarrinho() {
  sessionStorage.removeItem("carrinho");
  pintarCarrinho();
}

function rotuloAdicionar(id) {
  return lerCarrinho().some((item) => item.id === id) ? "No carrinho" : "Adicionar ao carrinho";
}

function pintarCarrinho() {
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

function abrirCarrinho() {
  pintarCarrinho();
  const caixa = document.querySelector("#carrinho");
  if (caixa && !caixa.open) caixa.showModal();
}

function continuarComprando() {
  document.querySelector("#carrinho")?.close();
  const catalogo = document.querySelector("#atividades");
  if (catalogo) {
    catalogo.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  location.href = "index.html#atividades";
}

function finalizarCarrinho() {
  const itens = lerCarrinho();
  if (!itens.length) return;
  const total = itens.reduce((soma, item) => soma + Number(item.preco), 0);
  document.querySelector("#carrinho")?.close();
  abrirPix({
    titulo: itens.length === 1 ? itens[0].titulo : `${itens.length} atividades`,
    resumo: itens.length === 1 ? itens[0].resumo : "",
    inclui: itens.length === 1 ? itens[0].inclui : itens.map((item) => item.titulo),
    preco: total,
    itens,
  });
}

function prepararCarrinho() {
  document.querySelector("#abre-carrinho")?.addEventListener("click", abrirCarrinho);
  document.querySelector("#carrinho .fechar")?.addEventListener("click", () => {
    document.querySelector("#carrinho")?.close();
  });
  document.querySelector("#carrinho-finalizar")?.addEventListener("click", finalizarCarrinho);
  document.querySelector("#carrinho-continuar")?.addEventListener("click", continuarComprando);
  document.querySelector("#carrinho-limpar")?.addEventListener("click", limparCarrinho);
  pintarCarrinho();
  if (new URLSearchParams(location.search).get("carrinho") === "1") abrirCarrinho();
}

