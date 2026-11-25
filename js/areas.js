import { definirFiltro, filtroAtual, mostrarCatalogo } from "./catalogo.js?v=5";
import { temasPorArea } from "./temas.js";

const LARGURA_ACORDEAO = "(max-width: 720px)";

export function prepararAreas() {
  const botao = document.querySelector(".abre-areas");
  const painel = document.querySelector("#areas-atividade");
  const coluna = document.querySelector("#subareas-coluna");
  const subareas = document.querySelector("#subareas-atividade");
  if (!botao || !painel || !coluna || !subareas) return;
  const grupoTemas = subareas.querySelector('[role="group"]');
  const seta = coluna.querySelector(".subareas-mais");
  const categoria = botao.closest(".categoria-atividades");
  const consultaMovel = window.matchMedia(LARGURA_ACORDEAO);

  const eMovel = () => consultaMovel.matches;

  const recolherAcordeao = () => {
    painel.querySelectorAll(".subareas-acordeao").forEach((item) => item.remove());
  };

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
    categoria?.classList.remove("categorias-abertas");
    painel.querySelectorAll("[data-area]").forEach((item) => item.setAttribute("aria-expanded", "false"));
    recolherAcordeao();
  };

  const avisoVazio = () => {
    const aviso = document.createElement("p");
    aviso.className = "subareas-vazio";
    const imagem = document.createElement("img");
    imagem.src = "img/em-breve.jpg?v=2";
    imagem.alt = "Em Breve";
    aviso.append(imagem);
    return aviso;
  };

  const botaoTema = (area, tema) => {
    const item = document.createElement("button");
    item.type = "button";
    item.dataset.tema = tema;
    item.textContent = tema;
    const filtro = filtroAtual();
    item.setAttribute("aria-pressed", String(filtro.area === area && filtro.tema === tema));
    item.addEventListener("click", () => {
      const atual = filtroAtual();
      const temaNovo = atual.tema === tema && atual.area === area ? "" : tema;
      definirFiltro(area, temaNovo);
      pintarTemas();
      mostrarCatalogo();
      fechar();
      document.querySelector("#atividades")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return item;
  };

  const pintarTemas = () => {
    const filtro = filtroAtual();
    grupoTemas.querySelectorAll("button").forEach((item) => {
      item.setAttribute("aria-pressed", String(item.dataset.tema === filtro.tema));
    });
  };

  const abrirTemas = (area) => {
    const filtro = filtroAtual();
    const temas = [...new Set(temasPorArea[area] || [])];
    const botoes = temas.map((tema) => botaoTema(area, tema));
    recolherAcordeao();
    grupoTemas.replaceChildren();
    if (eMovel()) {
      coluna.hidden = true;
      const destino = painel.querySelector(`[data-area="${CSS.escape(area)}"]`);
      const caixa = document.createElement("div");
      caixa.className = "subareas-acordeao";
      caixa.id = "subareas-acordeao";
      caixa.setAttribute("role", "group");
      caixa.setAttribute("aria-label", "Temas da área");
      if (temas.length) caixa.append(...botoes);
      else caixa.append(avisoVazio());
      destino?.insertAdjacentElement("afterend", caixa);
      destino?.setAttribute("aria-controls", caixa.id);
    } else {
      if (temas.length) grupoTemas.append(...botoes);
      else grupoTemas.append(avisoVazio());
      coluna.hidden = false;
      subareas.scrollTop = 0;
      requestAnimationFrame(() => requestAnimationFrame(atualizarSeta));
      setTimeout(atualizarSeta, 60);
    }
    painel.querySelectorAll("[data-area]").forEach((item) => {
      const aberto = item.dataset.area === area;
      item.setAttribute("aria-expanded", String(aberto));
      item.setAttribute("aria-pressed", String(aberto && filtro.area === area));
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
      categoria?.classList.add("categorias-abertas");
    }
  });

  painel.addEventListener("click", (evento) => evento.stopPropagation());
  document.addEventListener("click", fechar);
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") fechar();
  });

  painel.querySelectorAll("[data-area]").forEach((item) => {
    item.addEventListener("click", () => {
      const area = item.dataset.area;
      const atual = filtroAtual();
      const recolhido = eMovel() && item.getAttribute("aria-expanded") === "true";
      if (recolhido) {
        item.setAttribute("aria-expanded", "false");
        item.nextElementSibling?.classList.contains("subareas-acordeao") && item.nextElementSibling.remove();
        if (atual.area === area && !atual.tema) {
          definirFiltro("", "");
          mostrarCatalogo();
          item.setAttribute("aria-pressed", "false");
        }
        return;
      }
      if (!eMovel() && atual.area === area && !atual.tema) {
        definirFiltro("", "");
        mostrarCatalogo();
        painel.querySelectorAll("[data-area]").forEach((botaoArea) => botaoArea.setAttribute("aria-pressed", "false"));
        fechar();
        return;
      }
      definirFiltro(area, atual.area === area ? atual.tema : "");
      mostrarCatalogo();
      abrirTemas(area);
    });
  });

  consultaMovel.addEventListener("change", () => {
    const aberta = [...painel.querySelectorAll("[data-area]")].find((item) => item.getAttribute("aria-expanded") === "true");
    if (!aberta || painel.hidden) {
      recolherAcordeao();
      if (!eMovel()) coluna.hidden = true;
      return;
    }
    abrirTemas(aberta.dataset.area);
  });
}
