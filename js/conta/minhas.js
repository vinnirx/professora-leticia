import { aviso, moeda } from "./avisos.js";

function cartaoPedido(pedido, loja) {
  const artigo = document.createElement("article");
  artigo.className = "item-conta";
  const titulo = document.createElement("h3");
  titulo.textContent = pedido.titulo;
  const meta = document.createElement("p");
  meta.textContent = `${moeda.format(Number(pedido.valor))} · pedido ${pedido.txid}`;
  artigo.append(titulo, meta);
  const botao = document.createElement("button");
  botao.className = "botao";
  botao.type = "button";
  botao.textContent = "Baixar atividade";
  const estado = document.createElement("p");
  estado.className = "aviso-conta";
  estado.setAttribute("role", "status");
  botao.addEventListener("click", async () => {
    botao.disabled = true;
    try {
      await loja.baixar(pedido.atividade_id);
      aviso(estado, "O download começou.", true);
    } catch {
      aviso(estado, "O PDF ainda não está na área segura. Avisa a Letícia.");
    }
    botao.disabled = false;
  });
  artigo.append(botao, estado);
  return artigo;
}

export async function iniciarMinhas(loja) {
  const lista = document.querySelector("#lista-pedidos");
  const vazio = document.querySelector("#conta-vazia");
  const saudacao = document.querySelector("#saudacao");
  const sair = document.querySelector("#sair");
  sair.addEventListener("click", () => loja.sair());

  if (!loja.configurada) {
    vazio.hidden = false;
    vazio.textContent = "A conta ainda não está ligada ao banco. O próximo passo é criar o projeto no Supabase.";
    return;
  }
  const sessao = await loja.sessao();
  if (!sessao) {
    vazio.hidden = false;
    vazio.textContent = "Entre para ver as atividades que você comprou.";
    return;
  }
  const dados = await loja.perfil();
  saudacao.textContent = dados?.nome ? `Olá, ${dados.nome}` : "Minha conta";
  sair.hidden = false;
  if (dados?.papel === "admin") {
    document.querySelectorAll(".so-admin").forEach((link) => link.classList.add("visivel"));
  }
  const pedidos = await loja.meusPedidos();
  if (!pedidos.length) {
    vazio.hidden = false;
    vazio.textContent = "Você ainda não tem atividades. A de adição com apoio visual está na loja.";
    return;
  }
  pedidos.forEach((pedido) => lista.append(cartaoPedido(pedido, loja)));
}
