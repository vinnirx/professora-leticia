const historia = document.querySelector("#historia");

function abrirHistoria(evento) {
  evento.preventDefault();
  historia.showModal();
}

function fecharHistoria() {
  historia.close();
}

document.querySelectorAll(".abre-historia").forEach((origem) => {
  origem.addEventListener("click", abrirHistoria);
});

historia.querySelector(".fechar").addEventListener("click", fecharHistoria);

historia.addEventListener("close", () => {
  historia.scrollTop = 0;
});

if (location.hash === "#historia") historia.showModal();
