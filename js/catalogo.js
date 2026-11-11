import { abrirCarrinho, guardarNoCarrinho, pintarCarrinho } from "./carrinho.js";
import { dinheiro, escapar, linhas } from "./texto.js";

const grade = document.querySelector("#grade");
let catalogo = [];
let areaEscolhida = "";
let temaEscolhido = "";

export function filtroAtual() {
  return { area: areaEscolhida, tema: temaEscolhido };
}

export function definirFiltro(area, tema) {
  areaEscolhida = area;
  temaEscolhido = tema;
}

export function limparFiltro() {
  areaEscolhida = "";
  temaEscolhido = "";
}

function temasDoItem(item) {
  if (Array.isArray(item.temas) && item.temas.length) return [...new Set(item.temas)];
  if (item.tema) return [item.tema];
  if (item.id === "adicao" || item.id === "adicao-50" || item.id === "resolver-problemas") return ["Situações-Problema"];
  if (item.id === "silabas") return ["Separação e Classificação Silábica"];
  if (item.id === "celulas") return ["Células"];
  return [];
}

function paraCartao(item) {
  return {
    id: item.id,
    titulo: item.titulo,
    uso: item.uso || "",
    resumo: item.resumo || "",
    inclui: Array.isArray(item.inclui) ? item.inclui : linhas(item.inclui),
    preco: Number(item.preco),
    download: item.arquivo || item.download,
    pagina: `atividade.html?id=${encodeURIComponent(item.id)}`,
    area: item.area || (item.id === "adicao" || item.id === "adicao-50" || item.id === "resolver-problemas" ? "Matemática" : item.id === "silabas" ? "Português" : item.id === "celulas" ? "Ciências" : ""),
    temas: temasDoItem(item),
    destaque: item.destaque !== false,
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
      ${atividade.uso ? `<p class="chapeu">${escapar(atividade.uso)}</p>` : ""}
      <h3><a href="${atividade.pagina}">${escapar(atividade.titulo)}</a></h3>
      <p class="preco">${dinheiro(atividade.preco)}</p>
      <a class="botao comprar" href="${atividade.pagina}">Ver Atividade</a>
      <button class="botao botao-secundario adicionar-carrinho" type="button">Adicionar ao carrinho</button>
    </div>
  `;
  if (!atividade.capa) artigo.querySelector(".amostra")?.remove();
  const adicionar = artigo.querySelector(".adicionar-carrinho");
  adicionar.dataset.id = atividade.id;
  adicionar.addEventListener("click", () => {
    guardarNoCarrinho(atividade);
    abrirCarrinho();
  });
  return artigo;
}

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

export function mostrarCatalogo() {
  if (!grade) return;
  const campo = document.querySelector("#busca-atividade");
  const termo = campo?.value.trim() || "";
  const normal = termo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visiveis = catalogo.filter((item) => {
    const cabeBusca = !normal || textoBusca(item).includes(normal);
    if (normal) return cabeBusca;
    const cabeArea = !areaEscolhida || item.area === areaEscolhida;
    const cabeTema = !temaEscolhido || (item.temas || []).includes(temaEscolhido);
    if (areaEscolhida || temaEscolhido) return cabeArea && cabeTema;
    return item.destaque !== false;
  }).slice(0, normal || areaEscolhida || temaEscolhido ? undefined : 4);
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

export function prepararBusca() {
  document.querySelectorAll('a[href="#inicio"]').forEach((link) => {
    link.addEventListener("click", () => {
      const campo = document.querySelector("#busca-atividade");
      if (!campo?.value) return;
      campo.value = "";
      mostrarCatalogo();
    });
  });
}

export async function iniciarCatalogo() {
  if (!grade) return;
  const locais = window.loja.atividades.map(paraCartao);
  catalogo = locais;
  document.querySelector("#busca-atividade")?.addEventListener("input", mostrarCatalogo);
  document.querySelector("#voltar-destaque")?.addEventListener("click", () => {
    limparFiltro();
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
