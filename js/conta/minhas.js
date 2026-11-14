import { aviso, moeda } from "./avisos.js";
import { administra } from "./papeis.js";
import { linkAjuda } from "../texto.js";

function contato(pedido, motivo) {
  const link = document.createElement("a");
  link.className = "botao botao-secundario";
  link.textContent = "Falar com a Letícia";
  link.href = linkAjuda({ txid: pedido.txid, motivo });
  return link;
}

function selo(tipo, texto) {
  const marca = document.createElement("p");
  marca.className = `situacao situacao-${tipo}`;
  marca.textContent = texto;
  return marca;
}

function cartaoPedido(pedido, loja) {
  const artigo = document.createElement("article");
  artigo.className = "item-conta";
  const titulo = document.createElement("h3");
  titulo.textContent = pedido.titulo;
  const meta = document.createElement("p");
  meta.textContent = `${moeda.format(Number(pedido.valor))} · pedido ${pedido.txid}`;
  artigo.append(titulo, meta);
  const estado = document.createElement("p");
  estado.className = "aviso-conta";
  estado.setAttribute("role", "status");
  if (pedido.status === "estornado") {
    artigo.append(selo("problema", "Pagamento estornado"), estado, contato(pedido, "Meu pagamento foi estornado."));
    estado.textContent = "Este pagamento foi estornado. O PDF deixa de ficar disponível.";
    return artigo;
  }
  if (pedido.status === "cancelado") {
    artigo.append(selo("problema", "Pagamento cancelado"), estado, contato(pedido, "Minha cobrança foi cancelada."));
    estado.textContent = "Esta cobrança foi cancelada. O PDF continua bloqueado.";
    return artigo;
  }
  if (pedido.status !== "pago") {
    artigo.append(
      selo("espera", "Pagamento pendente"),
      estado,
      contato(pedido, "Meu Pix ainda não foi confirmado."),
    );
    estado.textContent = "O pagamento ainda não entrou. O PDF fica bloqueado até a confirmação. Se o banco recusou ou apareceu outro nome, fale com a Letícia.";
    return artigo;
  }
  artigo.append(selo("ok", "Pagamento confirmado"));
  const botao = document.createElement("button");
  botao.className = "botao";
  botao.type = "button";
  botao.textContent = "Baixar atividade";
  estado.hidden = true;
  botao.addEventListener("click", async () => {
    estado.hidden = false;
    botao.disabled = true;
    try {
      await loja.baixar(pedido.atividade_id);
      aviso(estado, "O download começou.", true);
    } catch (erro) {
      artigo.querySelector(".situacao")?.replaceWith(selo("problema", "Problema para baixar"));
      const mensagem = erro?.message === "entrar"
        ? "Entre de novo para baixar este material."
        : erro?.message === "negado"
          ? "Este material ainda não está liberado."
          : erro?.message === "tentar"
            ? "O download não respondeu. Tente de novo."
            : "O PDF não saiu. Fale com a Letícia e informe o código do pedido.";
      aviso(estado, mensagem);
      if (!artigo.querySelector("a[href^='mailto:']")) {
        artigo.append(contato(pedido, "O pagamento está confirmado, mas o PDF não baixou."));
      }
    }
    botao.disabled = false;
  });
  artigo.append(botao, estado, contato(pedido, "Preciso de ajuda com este pedido."));
  return artigo;
}

export async function iniciarMinhas(loja) {
  const lista = document.querySelector("#lista-pedidos");
  const vazio = document.querySelector("#conta-vazia");
  const saudacao = document.querySelector("#saudacao");
  const sair = document.querySelector("#sair");
  sair.addEventListener("click", () => {
    sair.disabled = true;
    sair.textContent = "Saindo…";
    loja.sair();
  });

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
  if (administra(dados?.papel)) {
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
