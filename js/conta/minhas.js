import { aviso, moeda } from "./avisos.js";
import { resumoAdministrativo } from "./apresentacao.js?v=2";
import { administra } from "./papeis.js";
import { rota } from "../rotas.js";
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

function ligarSaida(loja) {
  document.querySelectorAll("[data-sair-conta]").forEach((botao) => {
    botao.addEventListener("click", () => {
      botao.disabled = true;
      botao.textContent = "Saindo…";
      loja.sair();
    });
  });
}

function escrever(elemento, texto, href, rotulo) {
  elemento.replaceChildren(document.createTextNode(texto));
  if (!href) return;
  elemento.append(" ");
  const link = document.createElement("a");
  link.href = href;
  link.textContent = rotulo;
  elemento.append(link);
}

function indicador(item) {
  const artigo = document.createElement("article");
  artigo.className = "indicador";
  const nome = document.createElement("span");
  nome.textContent = item.rotulo;
  const forte = document.createElement("strong");
  forte.textContent = item.dinheiro ? moeda.format(item.valor) : item.valor;
  const nota = document.createElement("small");
  nota.textContent = item.nota;
  artigo.append(nome, forte, nota);
  return artigo;
}

function mostrarAdministracao(dados, resumo) {
  const bloco = document.querySelector("#conta-admin");
  const compras = document.querySelector("#area-compras");
  compras.hidden = true;
  bloco.hidden = false;
  document.querySelector("#topo-cliente").hidden = true;
  document.querySelector("#titulo-compras").hidden = false;
  document.querySelector("#conta-cargo").textContent = resumo.cargo;
  document.querySelector("#saudacao-admin").textContent = dados?.nome ? `Olá, ${dados.nome}` : "Conta administrativa";
  document.querySelector("#conta-admin-texto").textContent = resumo.texto;
  document.querySelector("#abrir-painel").href = rota("gerenciar/");
  document.querySelector("#sair-admin").hidden = false;
  const caixa = document.querySelector("#indicadores-conta");
  const avisoIndicadores = document.querySelector("#indicadores-aviso");
  if (!resumo.indicadores) {
    avisoIndicadores.hidden = false;
    avisoIndicadores.textContent = "Não consegui ler os números da loja agora. O gerenciamento continua disponível.";
  } else {
    caixa.replaceChildren(...resumo.indicadores.map(indicador));
    if (resumo.semPedidos) {
      avisoIndicadores.hidden = false;
      avisoIndicadores.classList.add("aviso-ok");
      avisoIndicadores.textContent = "Ainda não há pedidos. Os materiais cadastrados continuam na loja.";
    }
  }
  const atalhos = document.querySelector("#atalhos-conta");
  resumo.atalhos.forEach((atalho) => {
    const link = document.createElement("a");
    link.className = "atalho-conta";
    link.href = rota(`gerenciar/#${atalho.hash}`);
    link.textContent = atalho.texto;
    atalhos.append(link);
  });
  const botao = document.querySelector("#mostrar-compras");
  botao.addEventListener("click", () => {
    const aberto = compras.hidden;
    compras.hidden = !aberto;
    botao.setAttribute("aria-expanded", String(aberto));
    botao.textContent = aberto ? "Ocultar minhas compras" : "Minhas compras";
  });
}

export async function iniciarMinhas(loja) {
  const lista = document.querySelector("#lista-pedidos");
  const vazio = document.querySelector("#conta-vazia");
  const saudacao = document.querySelector("#saudacao");
  ligarSaida(loja);

  if (!loja.configurada) {
    vazio.hidden = false;
    vazio.textContent = "A conta ainda não está ligada ao banco. O próximo passo é criar o projeto no Supabase.";
    return;
  }
  const sessao = await loja.sessao();
  if (!sessao) {
    vazio.hidden = false;
    escrever(vazio, "Entre para ver os materiais que você comprou.", rota("entrar/"), "Entrar");
    return;
  }
  const ajuda = document.querySelector("#abrir-ajuda");
  const painelAjuda = document.querySelector("#ajuda-conta");
  ajuda.hidden = false;
  ajuda.addEventListener("click", () => {
    painelAjuda.hidden = false;
    ajuda.hidden = true;
  });
  document.querySelector("#form-ajuda")?.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const campos = new FormData(formulario);
    const assunto = String(campos.get("assunto") || "outro");
    const pedido = String(campos.get("pedido") || "").trim();
    const texto = String(campos.get("texto") || "").trim();
    const estado = document.querySelector("#ajuda-aviso");
    if (texto.length < 8) {
      aviso(estado, "Escreva a mensagem com um pouco mais de detalhe.");
      return;
    }
    const relato = pedido ? `Pedido informado: ${pedido}\n${texto}` : texto;
    const resultado = loja.abrirSolicitacao
      ? await loja.abrirSolicitacao({ assunto, txid: pedido, texto: relato })
      : { ok: false, ausente: true };
    if (resultado.ok) {
      aviso(estado, "Pedido de ajuda registrado. A Letícia consegue acompanhá-lo no painel.", true);
      formulario.reset();
      return;
    }
    if (resultado.ausente) {
      const link = document.createElement("a");
      link.href = linkAjuda({ txid: pedido, motivo: texto });
      link.textContent = "Abrir e-mail para a Letícia";
      estado.replaceChildren(document.createTextNode("A central ainda não está instalada no banco. "), link);
      return;
    }
    aviso(estado, resultado.mensagem || "Não foi possível registrar agora.");
  });
  const dados = await loja.perfil();
  saudacao.textContent = dados?.nome ? `Olá, ${dados.nome}` : "Minha conta";
  document.querySelector("#sair").hidden = false;
  const gestao = administra(dados?.papel);
  if (gestao) {
    document.querySelectorAll(".so-admin").forEach((link) => link.classList.add("visivel"));
    let resumo = resumoAdministrativo({ perfil: dados, atividades: null, pedidos: null });
    try {
      const [atividades, painel] = await Promise.all([loja.atividades(), loja.painel()]);
      resumo = resumoAdministrativo({ perfil: dados, atividades, pedidos: painel.pedidos });
    } catch {
      resumo = resumoAdministrativo({ perfil: dados, atividades: null, pedidos: null });
    }
    mostrarAdministracao(dados, resumo);
  }
  const pedidos = await loja.meusPedidos();
  if (!pedidos.length) {
    vazio.hidden = false;
    if (gestao) {
      vazio.textContent = "Nenhuma compra nesta conta. Os materiais da loja continuam cadastrados.";
    } else {
      escrever(vazio, "Você ainda não comprou materiais. Quando o pagamento for confirmado, o PDF aparece aqui.", rota("atividades/"), "Ver materiais");
    }
    return;
  }
  pedidos.forEach((pedido) => lista.append(cartaoPedido(pedido, loja)));
}
