import { definirFiltro, filtroAtual, mostrarCatalogo } from "./catalogo.js";
import { temasPorArea } from "./temas.js";

export function prepararAreas() {
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
    const filtro = filtroAtual();
    grupoTemas.querySelectorAll("button").forEach((item) => {
      item.setAttribute("aria-pressed", String(item.dataset.tema === filtro.tema));
    });
  };

  const abrirTemas = (area) => {
    const filtro = filtroAtual();
    grupoTemas.replaceChildren();
    const temas = [...new Set(temasPorArea[area] || [])];
    if (!temas.length) {
      const aviso = document.createElement("p");
      aviso.className = "subareas-vazio";
      const imagem = document.createElement("img");
      imagem.src = "img/em-breve.jpg?v=2";
      imagem.alt = "Em Breve";
      aviso.append(imagem);
      grupoTemas.append(aviso);
    } else {
      temas.forEach((tema) => {
        const item = document.createElement("button");
        item.type = "button";
        item.dataset.tema = tema;
        item.textContent = tema;
        item.setAttribute("aria-pressed", String(filtro.area === area && filtro.tema === tema));
        item.addEventListener("click", () => {
          const atual = filtroAtual();
          const temaNovo = atual.tema === tema && atual.area === area ? "" : tema;
          definirFiltro(temaNovo ? area : "", temaNovo);
          pintarTemas();
          mostrarCatalogo();
          fechar();
          if (filtroAtual().tema) document.querySelector("#atividades")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      item.setAttribute("aria-pressed", String(aberto && filtroAtual().area === area));
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
