export async function acionarSaida(botao, sair) {
  if (!botao || botao.disabled) return;
  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Saindo…";
  const resultado = await sair();
  if (resultado?.ok) return;
  botao.disabled = false;
  botao.textContent = rotulo;
  const pai = botao.parentElement;
  if (!pai) return;
  let aviso = pai.querySelector(":scope > .aviso-saida");
  if (!aviso) {
    aviso = document.createElement("p");
    aviso.className = "aviso-conta aviso-saida";
    botao.insertAdjacentElement("afterend", aviso);
  }
  aviso.hidden = false;
  aviso.textContent = resultado?.mensagem || "Não consegui encerrar as sessões desta conta. Tente sair de novo.";
}
