import { documentoValido } from "./documento.js";
import { dinheiro, escapar, linkAjuda } from "./texto.js";
import { itemOficial, limparCarrinho } from "./carrinho.js";

let pixAtual = "";
let pixManual = true;

function observarPedido(dialogo, txid, lojaConta) {
  let restantes = 40;
  const timer = setInterval(async () => {
    restantes -= 1;
    if (restantes <= 0 || !dialogo.open) {
      clearInterval(timer);
      return;
    }
    const situacao = await lojaConta.situacaoPedido(txid);
    const finais = {
      pago: ["ok", "Pagamento confirmado", "Pagamento confirmado. A liberação do PDF continua dependendo do servidor."],
      analise: ["problema", "Pagamento em análise", "O aviso não conferiu com o pedido. O PDF continua bloqueado."],
      expirada: ["problema", "Cobrança expirada", "Esta cobrança expirou. O PDF continua bloqueado."],
      estornada: ["problema", "Pagamento estornado", "Este pagamento foi estornado. O PDF continua bloqueado."],
      cancelada: ["problema", "Cobrança cancelada", "Esta cobrança foi cancelada. O PDF continua bloqueado."],
    };
    const final = finais[situacao];
    if (!final) return;
    clearInterval(timer);
    marcarEstado(final[0], final[1]);
    const caixa = document.querySelector("#pix-aviso");
    if (caixa) caixa.textContent = final[2];
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

export async function abrirPix(atividade) {
  const lojaConta = window.contaPronta ? await window.contaPronta : null;
  const ligada = Boolean(lojaConta?.configurada);
  let sessao = null;
  if (ligada) {
    sessao = await lojaConta.sessao();
    if (!sessao) {
      const volta = "index.html?carrinho=1";
      sessionStorage.setItem("depois", volta);
      location.href = `entrar.html?depois=${encodeURIComponent(volta)}`;
      return;
    }
  }

  const brutos = Array.isArray(atividade.itens) && atividade.itens.length ? atividade.itens : [atividade];
  const cobranca = brutos.map(itemOficial).filter(Boolean);
  const total = cobranca.length === brutos.length
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
  pedido.hidden = !window.loja.pixChave;
  const campoDocumento = document.querySelector("#campo-documento");
  if (campoDocumento) campoDocumento.hidden = window.loja.cobrancaAutomatica !== true;
  resultado.hidden = true;
  pixAtual = "";
  whatsapp.hidden = true;
  whatsapp.removeAttribute("href");
  document.querySelector("#pix-estado").hidden = true;
  aviso.textContent = window.loja.pixChave
    ? "O pagamento ainda não foi feito. Ao gerar o QR, o pedido fica pendente até a confirmação."
    : "A chave Pix ainda não foi cadastrada. Quando a Letícia passar a chave, o QR aparece aqui.";

  if (total == null) {
    pedido.hidden = true;
    marcarEstado("problema", "Problema no pagamento", linkAjuda({ motivo: "Não foi possível preparar o Pix desta atividade." }));
    aviso.textContent = "Não foi possível gerar o Pix desta atividade. Fale com a Letícia e atualize a página.";
  }

  pedido.onsubmit = async (evento) => {
    evento.preventDefault();
    if (total == null || pedido.dataset.enviando === "1") return;
    pedido.dataset.enviando = "1";
    try {
    const dados = new FormData(pedido);
    const nome = String(dados.get("nome") || "").trim();
    const email = String(dados.get("email") || "").trim();
    if (window.loja.cobrancaAutomatica) {
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
      if (!pedido.dataset.chaveCobranca) pedido.dataset.chaveCobranca = crypto.randomUUID();
      const automatica = await lojaConta.criarCobranca(
        cobranca.map((item) => item.id),
        pedido.dataset.chaveCobranca,
        documento,
      );
      if (!automatica.ok || !automatica.copiaCola) {
        marcarEstado("problema", "Problema no pagamento", linkAjuda({ email, motivo: automatica.mensagem || "A cobrança automática não saiu." }));
        aviso.textContent = automatica.mensagem || "A cobrança automática não está disponível.";
        return;
      }
      pixManual = false;
      pixAtual = automatica.copiaCola;
      const caixaAutomatica = document.querySelector("#pix-imagem");
      caixaAutomatica.replaceChildren();
      if (automatica.imagem) {
        const imagem = document.createElement("img");
        imagem.alt = "QR Code Pix da cobrança";
        imagem.src = String(automatica.imagem).startsWith("data:")
          ? automatica.imagem
          : `data:image/png;base64,${automatica.imagem}`;
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
      marcarEstado("espera", "Pagamento pendente", linkAjuda({ txid: automatica.txid, email, motivo: "Gerei o Pix e preciso de ajuda." }));
      aviso.textContent = `Pague ${dinheiro(automatica.valor)}. O PDF só entra em Minha conta depois que o Asaas confirmar o recebimento.`;
      observarPedido(dialogo, automatica.txid, lojaConta);
      return;
    }
    if (!window.loja.pixChave) return;
    pixManual = true;
    const txid = window.identificadorPix();
    if (ligada) {
      const ids = cobranca.map((item) => item.id);
      const gravado = ids.length > 1
        ? await lojaConta.registrarPedidos(ids, txid)
        : await lojaConta.registrarPedido(ids[0], txid);
      if (!gravado.ok) {
        marcarEstado("problema", "Problema no pagamento", linkAjuda({
          txid,
          email,
          motivo: "O pedido não ficou registrado.",
        }));
        aviso.textContent = gravado.mensagem;
        return;
      }
    }
    const caixa = document.querySelector("#pix-imagem");
    try {
      pixAtual = window.montarPix({
        chave: window.loja.pixChave,
        nome: window.loja.pixNome,
        cidade: window.loja.pixCidade,
        valor: total,
        txid,
      });
      if (!window.desenharQr(caixa, pixAtual, total)) throw new Error("qr");
    } catch {
      pixAtual = "";
      caixa.replaceChildren();
      document.querySelector("#pix-cola").value = "";
      marcarEstado("problema", "Problema no pagamento", linkAjuda({
        txid,
        email,
        motivo: "O pedido foi registrado, mas o QR do Pix não saiu.",
      }));
      aviso.textContent = "O pedido ficou pendente, mas o QR não saiu. Fale com a Letícia e informe o código.";
      return;
    }
    document.querySelector("#pix-codigo").textContent = txid;
    document.querySelector("#pix-pessoa").textContent = `${nome} · ${email}`;
    document.querySelector("#pix-cola").value = pixAtual;
    document.querySelector("#pix-resumo").hidden = true;
    document.querySelector("#pix-inclui").hidden = true;
    pedido.hidden = true;
    resultado.hidden = false;
    limparCarrinho();
    marcarEstado("espera", "Pagamento pendente", linkAjuda({ txid, email, motivo: "Gerei o Pix e preciso de ajuda." }));
    aviso.textContent = ligada
      ? `Pague ${dinheiro(total)}. O PDF só entra em Minha conta quando este pagamento for confirmado.`
      : `Pague ${dinheiro(total)}. A conta ainda não está ligada ao banco, então o download entra quando ela estiver.`;
    if (ligada) observarPedido(dialogo, txid, lojaConta);
    if (/^[0-9]{10,15}$/.test(window.loja.whatsapp || "")) {
      const nomes = cobranca.map((item) => item.titulo).join(", ");
      const texto = encodeURIComponent(
        `Olá, Letícia. Segue o comprovante do Pix de ${nomes} (${dinheiro(total)}). Código do pedido: ${txid}. Meu e-mail: ${email}.`,
      );
      whatsapp.hidden = false;
      whatsapp.href = `https://wa.me/${window.loja.whatsapp}?text=${texto}`;
    }
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
}
