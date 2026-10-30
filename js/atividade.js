const atividade = loja.atividades.find((item) => item.id === "adicao");
const comprar = document.querySelector("#comprar");

if (atividade) {
  document.querySelectorAll("[data-preco]").forEach((elemento) => {
    elemento.textContent = dinheiro(atividade.preco);
  });
  comprar.addEventListener("click", () => abrirPix(atividade));
}
