import { quando } from "./avisos.js";
import { aguardaResposta, protocoloVisivel, rotuloAssunto, rotuloSolicitacao } from "../suporte.js?v=1";

export function mensagensEmOrdem(item) {
  return [...(item?.mensagens || [])].sort((a, b) => String(a?.criado_em || "").localeCompare(String(b?.criado_em || "")));
}

export function autorDaMensagem(mensagem, item) {
  if (!mensagem?.autor_id || !item?.usuario_id) return "";
  return mensagem.autor_id === item.usuario_id ? "Cliente" : "Equipe";
}

function dataLegivel(iso) {
  const data = new Date(iso || "");
  if (!iso || Number.isNaN(data.getTime())) return "";
  return quando.format(data);
}

export function tipoDaSituacao(status) {
  if (status === "resolvido") return "ok";
  if (status === "atendimento") return "espera";
  return "neutro";
}

export function resumoDoChamado(item, valor) {
  const mensagens = mensagensEmOrdem(item);
  const ultima = mensagens.at(-1) || null;
  const pedido = String(item?.txid || "").trim();
  const quantia = String(valor || "").trim();
  return {
    assunto: rotuloAssunto(item?.assunto),
    situacao: rotuloSolicitacao(item?.status),
    tipo: tipoDaSituacao(item?.status),
    data: dataLegivel(item?.criado_em),
    nome: String(item?.nome || "").trim(),
    email: String(item?.email || "").trim(),
    protocolo: protocoloVisivel(item),
    pedido,
    valor: pedido && quantia && quantia !== "—" ? quantia : "",
    aguardando: aguardaResposta(item) && item?.status !== "resolvido",
    previa: String(ultima?.texto || "").trim(),
    autorPrevia: autorDaMensagem(ultima, item),
    mensagens: mensagens.map((mensagem) => ({
      autor: autorDaMensagem(mensagem, item),
      data: dataLegivel(mensagem.criado_em),
      texto: String(mensagem?.texto || ""),
    })),
  };
}

function campo(rotulo, valor, discreto) {
  if (!valor) return [];
  const dt = document.createElement("dt");
  dt.textContent = rotulo;
  const dd = document.createElement("dd");
  dd.textContent = valor;
  if (discreto) dd.className = "cartao-suporte-ausente";
  return [dt, dd];
}

export function criarCartaoSuporte(item, opcoes = {}) {
  const resumo = resumoDoChamado(item, opcoes.valor);
  const criarBotao = opcoes.criarBotao;
  const artigo = document.createElement("article");
  artigo.className = "cartao-suporte";
  if (item?.id) artigo.dataset.chamado = item.id;

  const topo = document.createElement("div");
  topo.className = "cartao-suporte-topo";
  const titulo = document.createElement("h3");
  titulo.textContent = resumo.assunto;
  const marcas = document.createElement("div");
  marcas.className = "cartao-suporte-marcas";
  const badge = document.createElement("span");
  badge.className = `etiqueta etiqueta-${resumo.tipo}`;
  badge.textContent = resumo.situacao;
  marcas.append(badge);
  if (resumo.aguardando) {
    const espera = document.createElement("span");
    espera.className = "cartao-suporte-espera";
    espera.textContent = "Aguardando resposta";
    marcas.append(espera);
  }
  if (resumo.data) {
    const data = document.createElement("time");
    data.dateTime = item?.criado_em || "";
    data.textContent = resumo.data;
    marcas.append(data);
  }
  topo.append(titulo, marcas);

  const dados = document.createElement("dl");
  dados.className = "cartao-suporte-dados";
  dados.append(
    ...campo("Cliente", resumo.nome),
    ...campo("E-mail", resumo.email),
    ...campo("Protocolo", resumo.protocolo),
    ...campo("Pedido", resumo.pedido || "Não vinculado", !resumo.pedido),
    ...campo("Valor", resumo.valor),
  );

  artigo.append(topo, dados);
  if (resumo.previa) {
    const previa = document.createElement("div");
    previa.className = "cartao-suporte-previa";
    if (resumo.autorPrevia) {
      const autor = document.createElement("span");
      autor.textContent = resumo.autorPrevia;
      previa.append(autor);
    }
    const texto = document.createElement("p");
    texto.textContent = resumo.previa;
    previa.append(texto);
    artigo.append(previa);
  }

  const acoes = document.createElement("div");
  acoes.className = "acoes-pdf";
  if (criarBotao) {
    acoes.append(criarBotao("Ver conversa", () => opcoes.aoVer?.(item)));
    acoes.append(criarBotao("Responder", () => opcoes.aoResponder?.(item)));
    if (item?.status !== "atendimento") acoes.append(criarBotao("Em atendimento", () => opcoes.aoSituacao?.(item, "atendimento")));
    if (item?.status !== "resolvido") acoes.append(criarBotao("Resolvido", () => opcoes.aoSituacao?.(item, "resolvido")));
  }
  opcoes.extra?.(item, acoes);
  artigo.append(acoes);
  return artigo;
}

export function preencherHistorico(destino, item) {
  destino.replaceChildren();
  const mensagens = mensagensEmOrdem(item);
  if (!mensagens.length) {
    const vazio = document.createElement("p");
    vazio.className = "cartao-suporte-vazio";
    vazio.textContent = "Sem mensagens.";
    destino.append(vazio);
    return;
  }
  mensagens.forEach((mensagem) => {
    const bloco = document.createElement("article");
    bloco.className = "mensagem-suporte";
    const meta = [autorDaMensagem(mensagem, item), dataLegivel(mensagem.criado_em)].filter(Boolean).join(" · ");
    if (meta) {
      const cabeca = document.createElement("p");
      cabeca.className = "mensagem-suporte-meta";
      cabeca.textContent = meta;
      bloco.append(cabeca);
    }
    const texto = document.createElement("p");
    texto.textContent = String(mensagem?.texto || "");
    bloco.append(texto);
    destino.append(bloco);
  });
}
