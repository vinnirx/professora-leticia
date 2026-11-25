import { origemDaImagemPix } from "./imagem-pix.js?v=1";
import { documentoValido, mascararDocumento } from "./documento.js";
import { cobrancaReutilizavel, gravarTentativa, lerTentativa, limparTentativa } from "./tentativa-compra.js";
import { rota } from "./rotas.js?v=3";
import { dinheiro, escapar, linkAjuda, MENSAGEM_COMPRA_INDISPONIVEL } from "./texto.js";
import { itemOficial, limparCarrinho } from "./carrinho.js?v=2";

let pixAtual = "";
let pixManual = true;

function mensagensDoPedido(automatico) {
  if (automatico) {
    return {
      pago: ["ok", "Pagamento confirmado!", "Sua compra foi aprovada. Seu material já está disponível para download."],
      analise: ["problema", "Pagamento em análise", "O aviso não conferiu com o pedido. O PDF continua bloqueado."],
      expirada: ["problema", "Cobrança expirada", "O prazo do Pix expirou. Gere uma nova cobrança."],
      estornada: ["problema", "Pagamento estornado", "Este pagamento foi estornado. O PDF continua bloqueado."],
      cancelada: ["problema", "Cobrança cancelada", "Esta cobrança foi cancelada. O PDF continua bloqueado."],
    };
  }
  return {
    pago: ["ok", "Pagamento confirmado", "Pagamento confirmado. A liberação do PDF continua dependendo do servidor."],
    analise: ["problema", "Pagamento em análise", "O aviso não conferiu com o pedido. O PDF continua bloqueado."],
    expirada: ["problema", "Cobrança expirada", "Esta cobrança expirou. O PDF continua bloqueado."],
    estornada: ["problema", "Pagamento estornado", "Este pagamento foi estornado. O PDF continua bloqueado."],
    cancelada: ["problema", "Cobrança cancelada", "Esta cobrança foi cancelada. O PDF continua bloqueado."],
  };
}

function observarPedido(dialogo, txid, lojaConta, automatico) {
  let restantes = 40;
  const timer = setInterval(async () => {
    restantes -= 1;
    const caixa = document.querySelector("#pix-aviso");
    if (!dialogo.open) {
      clearInterval(timer);
      return;
    }
    if (restantes <= 0) {
      clearInterval(timer);
      if (automatico && caixa) caixa.textContent = "Se você já pagou, aguarde a atualização ou procure o suporte.";
      return;
    }
    const situacao = await lojaConta.situacaoPedido(txid);
    const final = mensagensDoPedido(automatico)[situacao];
    if (!final) return;
    clearInterval(timer);
    marcarEstado(final[0], final[1]);
    if (caixa) caixa.textContent = final[2];
    if (automatico && situacao === "pago") mostrarCompraPaga(lojaConta, txid);
  }, 8000);
  dialogo.addEventListener("close", () => clearInterval(timer), { once: true });
}

function marcarEstado(tipo, texto, ajuda) {
  const caixa = document.querySelector("#pix-estado");
  const selo = document.querySelector("#pix-situacao");
  const link = document.querySelector("#pix-ajuda");
  if (!caixa || !selo) return;
  caixa.hidden = false;
  selo.className = `situacao situacao-${tipo}`;
  selo.textContent = texto;
  if (!link) return;
  if (!ajuda) {
    link.hidden = true;
    link.removeAttribute("href");
    return;
  }
  link.hidden = false;
  link.href = ajuda;
}

export const DESTINO_MATERIAIS = "minha-conta/#materiais";
export const TEXTO_COMPRA_APROVADA = "Sua compra foi aprovada. Seu material já está disponível para download.";

export function acoesDaCompraPaga(materiais) {
  const ids = [];
  const vistos = new Set();
  for (const item of materiais || []) {
    const id = String(item?.id || item?.atividade_id || "");
    if (!/^[a-z0-9-]{1,48}$/.test(id) || vistos.has(id)) continue;
    vistos.add(id);
    ids.push(id);
  }
  if (ids.length === 1) return { principal: "baixar", baixar: ids[0], destino: DESTINO_MATERIAIS };
  return { principal: "materiais", baixar: "", destino: DESTINO_MATERIAIS };
}

export function mensagemDoDownload(codigo) {
  if (codigo === "entrar") return "Entre de novo para baixar este material.";
  if (codigo === "negado") return "Este material ainda não está liberado.";
  if (codigo === "tentar") return "Não foi possível preparar o download. Tente de novo.";
  return "Não foi possível baixar agora. Tente de novo ou abra Meus materiais.";
}

function enderecoDosMateriais(entrar) {
  if (!entrar) return `${rota("minha-conta/")}#materiais`;
  return `${rota("entrar/")}?depois=${encodeURIComponent(DESTINO_MATERIAIS)}`;
}

function iconeDownload() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const caminho = document.createElementNS("http://www.w3.org/2000/svg", "path");
  caminho.setAttribute("fill", "currentColor");
  caminho.setAttribute("d", "M12 3a1 1 0 0 1 1 1v8.6l2.3-2.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L11 12.6V4a1 1 0 0 1 1-1zm-7 14a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z");
  svg.append(caminho);
  return svg;
}

function linkMateriais(principal, entrar) {
  const link = document.createElement("a");
  link.className = principal ? "botao" : "botao botao-secundario";
  link.href = enderecoDosMateriais(entrar);
  link.textContent = "Ver meus materiais";
  return link;
}

function botaoBaixar(id, loja, aviso) {
  const botao = document.createElement("button");
  botao.className = "botao";
  botao.type = "button";
  botao.append(iconeDownload());
  const rotulo = document.createElement("span");
  rotulo.textContent = "Baixar minha atividade";
  botao.append(rotulo);
  botao.addEventListener("click", async () => {
    if (botao.dataset.baixando === "1" || typeof loja?.baixar !== "function") return;
    botao.dataset.baixando = "1";
    botao.disabled = true;
    rotulo.textContent = "Preparando o download...";
    try {
      await loja.baixar(id);
      aviso.textContent = "O download começou.";
    } catch (erro) {
      const codigo = erro?.message || "";
      aviso.textContent = mensagemDoDownload(codigo);
      if (codigo === "entrar") {
        try { sessionStorage.setItem("depois", DESTINO_MATERIAIS); } catch { /* o endereço ainda leva ao login */ }
        location.assign(enderecoDosMateriais(true));
        return;
      }
    }
    delete botao.dataset.baixando;
    botao.disabled = false;
    rotulo.textContent = "Baixar minha atividade";
  });
  return botao;
}

export function aplicarCompraPaga(dialogo, { acoes, loja, entrar = false }) {
  const pedido = dialogo.querySelector("#pix-pedido");
  if (pedido) pedido.hidden = true;
  const resultado = dialogo.querySelector("#pix-resultado");
  if (resultado) resultado.hidden = true;
  const selo = dialogo.querySelector("#pix-situacao");
  if (selo) selo.hidden = true;
  let painel = dialogo.querySelector("#pix-liberado");
  if (!painel) {
    painel = document.createElement("div");
    painel.id = "pix-liberado";
    painel.className = "pix-liberado";
    const titulo = document.createElement("p");
    titulo.className = "pix-liberado-titulo";
    titulo.dataset.titulo = "sim";
    const frase = document.createElement("p");
    frase.dataset.frase = "sim";
    const caixa = document.createElement("div");
    caixa.className = "pix-acoes";
    caixa.dataset.acoes = "sim";
    const estado = document.createElement("p");
    estado.className = "miudo";
    estado.dataset.aviso = "sim";
    estado.setAttribute("role", "status");
    painel.append(titulo, frase, caixa, estado);
    const ancora = dialogo.querySelector("#pix-aviso");
    if (ancora) ancora.before(painel);
    else (dialogo.querySelector(".pix-painel") || dialogo).append(painel);
  }
  painel.hidden = false;
  painel.querySelector("[data-titulo]").textContent = "Pagamento confirmado!";
  painel.querySelector("[data-frase]").textContent = TEXTO_COMPRA_APROVADA;
  const aviso = painel.querySelector("[data-aviso]");
  aviso.textContent = entrar ? mensagemDoDownload("entrar") : "";
  const caixa = painel.querySelector("[data-acoes]");
  caixa.replaceChildren();
  if (acoes.baixar && !entrar) caixa.append(botaoBaixar(acoes.baixar, loja, aviso));
  caixa.append(linkMateriais(acoes.principal !== "baixar" || entrar, entrar));
  const avisoGeral = dialogo.querySelector("#pix-aviso");
  if (avisoGeral) avisoGeral.textContent = "";
  return painel;
}

async function mostrarCompraPaga(loja, txid) {
  const dialogo = document.querySelector("#pix");
  if (!dialogo) return;
  const consulta = typeof loja?.materiaisPagos === "function"
    ? await loja.materiaisPagos(txid)
    : { ok: false, materiais: [] };
  const acoes = acoesDaCompraPaga(consulta.ok ? consulta.materiais : []);
  const painel = aplicarCompraPaga(dialogo, { acoes, loja, entrar: consulta.entrar === true });
  if (!consulta.entrar && (!consulta.ok || !consulta.materiais?.length)) {
    painel.querySelector("[data-aviso]").textContent = "Não consegui identificar o material deste pedido. Abra Meus materiais.";
  }
}

export async function abrirPix(atividade) {
  const lojaConta = window.contaPronta ? await window.contaPronta : null;
  const ligada = Boolean(lojaConta?.configurada);
  let sessao = null;
  if (ligada) {
    sessao = await lojaConta.sessao();
    if (!sessao) {
      const volta = "index.html?carrinho=1";
      sessionStorage.setItem("depois", volta);
      location.href = `${rota("entrar/")}?depois=${encodeURIComponent(volta)}`;
      return;
    }
  }

  const brutos = Array.isArray(atividade.itens) && atividade.itens.length ? atividade.itens : [atividade];
  const cobranca = brutos.map(itemOficial).filter(Boolean);
  let total = cobranca.length === brutos.length
    ? Number(cobranca.reduce((soma, item) => soma + item.preco, 0).toFixed(2))
    : null;

  const dialogo = document.querySelector("#pix");
  const pedido = document.querySelector("#pix-pedido");
  const resultado = document.querySelector("#pix-resultado");
  const aviso = document.querySelector("#pix-aviso");
  const copiar = document.querySelector("#copiar");
  const whatsapp = document.querySelector("#whatsapp");
  const nomeInput = pedido.querySelector('[name="nome"]');
  const emailInput = pedido.querySelector('[name="email"]');

  document.querySelector("#pix-titulo").textContent = atividade.titulo;
  document.querySelector("#pix-preco").textContent = total == null ? "" : dinheiro(total);
  document.querySelector("#pix-resumo").hidden = !atividade.resumo;
  document.querySelector("#pix-resumo").textContent = atividade.resumo || "";
  document.querySelector("#pix-inclui").hidden = !(atividade.inclui || []).length;
  document.querySelector("#pix-inclui").innerHTML = (atividade.inclui || []).map((item) => `<li>${escapar(item)}</li>`).join("");
  pedido.reset();
  nomeInput.readOnly = false;
  emailInput.readOnly = false;
  if (sessao) {
    const perfil = await lojaConta.perfil();
    nomeInput.value = perfil?.nome || "";
    emailInput.value = sessao.user.email || "";
    nomeInput.readOnly = true;
    emailInput.readOnly = true;
  }
  const campoDocumento = document.querySelector("#campo-documento");
  let automaticoNestaConta = window.loja.cobrancaAutomatica === true;
  if (!automaticoNestaConta && ligada && sessao) {
    automaticoNestaConta = await lojaConta.pixAutomaticoDisponivel() === true;
  }
  if (campoDocumento) campoDocumento.hidden = !automaticoNestaConta;
  resultado.hidden = true;
  pixAtual = "";
  pixManual = false;
  whatsapp.hidden = true;
  whatsapp.removeAttribute("href");
  document.querySelector("#pix-estado").hidden = true;

  const fecharCompra = () => {
    pedido.hidden = true;
    resultado.hidden = true;
    pixAtual = "";
    pixManual = false;
    const cola = document.querySelector("#pix-cola");
    if (cola) cola.value = "";
    document.querySelector("#pix-imagem")?.replaceChildren();
    whatsapp.hidden = true;
    whatsapp.removeAttribute("href");
    marcarEstado("problema", "Compras em preparação", rota("ajuda/"));
    aviso.textContent = MENSAGEM_COMPRA_INDISPONIVEL;
  };

  const emailConfirmado = !ligada || !sessao || Boolean(sessao.user.email_confirmed_at);
  if (!emailConfirmado) {
    pedido.hidden = true;
    marcarEstado("problema", "Confirme seu e-mail", rota("ajuda/"));
    aviso.textContent = "Confirme seu e-mail antes de comprar. Verifique a caixa de entrada e também o spam.";
  } else if (!automaticoNestaConta || total == null) {
    if (automaticoNestaConta && total == null) {
      pedido.hidden = true;
      marcarEstado("problema", "Problema no pagamento", linkAjuda({ motivo: "Não foi possível preparar o Pix desta atividade." }));
      aviso.textContent = "Não foi possível gerar o Pix desta atividade. Fale com a Letícia e atualize a página.";
    } else {
      fecharCompra();
    }
  } else {
    pedido.hidden = false;
    aviso.textContent = "O pagamento ainda não foi feito. Ao gerar o QR, o pedido fica pendente até a confirmação.";
  }

  pedido.onsubmit = async (evento) => {
    evento.preventDefault();
    if (!emailConfirmado) {
      marcarEstado("problema", "Confirme seu e-mail", rota("ajuda/"));
      aviso.textContent = "Confirme seu e-mail antes de comprar. Verifique a caixa de entrada e também o spam.";
      return;
    }
    if (!automaticoNestaConta) {
      fecharCompra();
      return;
    }
    if (total == null || pedido.dataset.enviando === "1") return;
    pedido.dataset.enviando = "1";
    try {
    const dados = new FormData(pedido);
    const nome = String(dados.get("nome") || "").trim();
    const email = String(dados.get("email") || "").trim();
    if (!ligada || !sessao) {
      marcarEstado("problema", "Problema no pagamento", linkAjuda({ email, motivo: "Preciso entrar na conta para gerar a cobrança." }));
      aviso.textContent = "Entre na conta para gerar a cobrança.";
      return;
    }
    const documento = String(dados.get("documento") || "");
    if (!documentoValido(documento)) {
      marcarEstado("problema", "Problema no pagamento", linkAjuda({ email, motivo: "O CPF ou CNPJ não foi aceito." }));
      aviso.textContent = "Informe um CPF ou CNPJ válido para gerar o Pix.";
      return;
    }
    if (!pedido.dataset.chaveCobranca) {
      pedido.dataset.chaveCobranca = lerTentativa(sessionStorage, cobranca.map((item) => item.id))?.codigo || crypto.randomUUID();
    }
    gravarTentativa(sessionStorage, cobranca.map((item) => item.id), pedido.dataset.chaveCobranca);
    const automatica = await lojaConta.criarCobranca(
      cobranca.map((item) => item.id),
      pedido.dataset.chaveCobranca,
      documento,
    );
    if (!automatica.ok || !automatica.copiaCola) {
      const texto = automatica.mensagem || "A cobrança automática não está disponível.";
      const semCobranca = /nenhum pix foi gerado/i.test(texto);
      marcarEstado("problema", semCobranca ? "Pix não gerado" : "Problema no pagamento", linkAjuda({ email, motivo: texto }));
      aviso.textContent = texto;
      return;
    }
    if (!cobrancaReutilizavel({ status: automatica.status, expiraEm: automatica.expiraEm })) {
      limparTentativa(sessionStorage);
      delete pedido.dataset.chaveCobranca;
      marcarEstado("problema", "Problema no pagamento", linkAjuda({ email, motivo: "A cobrança anterior não pode ser reutilizada." }));
      if (automatica.status === "pago") {
        aviso.textContent = TEXTO_COMPRA_APROVADA;
        mostrarCompraPaga(lojaConta, automatica.txid);
      }
      else if (automatica.status === "expirada") aviso.textContent = "O prazo do Pix expirou. Gere uma nova cobrança.";
      else aviso.textContent = "Essa cobrança não está mais válida. Gere o Pix outra vez.";
      return;
    }
    pixManual = false;
    pixAtual = automatica.copiaCola;
    const caixaAutomatica = document.querySelector("#pix-imagem");
    caixaAutomatica.replaceChildren();
    const origem = origemDaImagemPix(automatica.imagem);
    if (origem) {
      const imagem = document.createElement("img");
      imagem.alt = "QR Code Pix da cobrança";
      imagem.src = origem;
      caixaAutomatica.append(imagem);
    }
    document.querySelector("#pix-codigo").textContent = automatica.txid;
    document.querySelector("#pix-pessoa").textContent = `${nome} · ${email}`;
    document.querySelector("#pix-cola").value = pixAtual;
    document.querySelector("#pix-resumo").hidden = true;
    document.querySelector("#pix-inclui").hidden = true;
    pedido.hidden = true;
    resultado.hidden = false;
    limparCarrinho();
    limparTentativa(sessionStorage);
    marcarEstado("espera", "Estamos aguardando a confirmação do pagamento.", linkAjuda({ txid: automatica.txid, email, motivo: "Gerei o Pix e preciso de ajuda." }));
    aviso.textContent = "Seu Pix está pronto. Escaneie o QR Code ou utilize o Pix Copia e Cola.";
    observarPedido(dialogo, automatica.txid, lojaConta, true);
    } finally {
      if (!pedido.hidden) delete pedido.dataset.enviando;
    }
  };

  copiar.onclick = async () => {
    if (!pixAtual || (pixManual && !window.payloadPixValido(pixAtual, total))) return;
    const campo = document.querySelector("#pix-cola");
    try {
      await navigator.clipboard.writeText(pixAtual);
      aviso.textContent = "Pix copiado. O pagamento continua pendente até a confirmação.";
    } catch {
      campo.focus();
      campo.select();
      aviso.textContent = "Não foi possível copiar sozinho. O código está selecionado para você copiar.";
    }
  };

  dialogo.showModal();
}

export function prepararCheckout() {
  const dialogo = document.querySelector("#pix");
  if (!dialogo) return;
  document.querySelector("#pix .fechar")?.addEventListener("click", () => dialogo.close());
  const documento = dialogo.querySelector("[name=documento]");
  documento?.addEventListener("input", () => {
    documento.value = mascararDocumento(documento.value);
  });
}
