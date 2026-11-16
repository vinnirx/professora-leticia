import { documentoValido, mascararDocumento } from "./documento.js";
import { cobrancaReutilizavel, gravarTentativa, lerTentativa, limparTentativa } from "./tentativa-compra.js";
import { rota } from "./rotas.js";
import { dinheiro, escapar, linkAjuda } from "./texto.js";
import { itemOficial, limparCarrinho } from "./carrinho.js?v=2";
import { totalConfirmado } from "./valor-pedido.js";

let pixAtual = "";
let pixManual = true;

function mensagensDoPedido(automatico) {
  if (automatico) {
    return {
      pago: ["ok", "Pagamento confirmado", "Pagamento confirmado! Seus materiais estão disponíveis em Minha Conta."],
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
  pedido.hidden = !window.loja.pixChave;
  const campoDocumento = document.querySelector("#campo-documento");
  let automaticoNestaConta = window.loja.cobrancaAutomatica === true;
  if (!automaticoNestaConta && ligada && sessao) {
    automaticoNestaConta = await lojaConta.pixAutomaticoDisponivel() === true;
  }
  if (campoDocumento) campoDocumento.hidden = !automaticoNestaConta;
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
    if (ligada && !sessao?.user?.email_confirmed_at) {
      marcarEstado("problema", "Confirme seu e-mail", "");
      aviso.textContent = "Confirme seu e-mail antes de comprar. Verifique a caixa de entrada e também o spam.";
      return;
    }
    if (automaticoNestaConta) {
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
        if (automatica.status === "pago") aviso.textContent = "Pagamento confirmado! Seus materiais estão disponíveis em Minha Conta.";
        else if (automatica.status === "expirada") aviso.textContent = "O prazo do Pix expirou. Gere uma nova cobrança.";
        else aviso.textContent = "Essa cobrança não está mais válida. Gere o Pix outra vez.";
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
      limparTentativa(sessionStorage);
      marcarEstado("espera", "Estamos aguardando a confirmação do pagamento.", linkAjuda({ txid: automatica.txid, email, motivo: "Gerei o Pix e preciso de ajuda." }));
      aviso.textContent = "Seu Pix está pronto. Escaneie o QR Code ou utilize o Pix Copia e Cola.";
      observarPedido(dialogo, automatica.txid, lojaConta, true);
      return;
    }
    if (!window.loja.pixChave) return;
    pixManual = true;
    const ids = cobranca.map((item) => item.id);
    const txid = lerTentativa(sessionStorage, ids)?.codigo || window.identificadorPix();
    gravarTentativa(sessionStorage, ids, txid);
    if (ligada) {
      let gravado = ids.length > 1
        ? await lojaConta.registrarPedidos(ids, txid)
        : await lojaConta.registrarPedido(ids[0], txid);
      if (!gravado.ok && gravado.repetido) {
        const existentes = (await lojaConta.meusPedidos()).filter((item) => item.txid === txid);
        if (existentes.length && existentes.every((item) => item.status === "pago")) {
          limparTentativa(sessionStorage);
          limparCarrinho();
          marcarEstado("ok", "Pagamento confirmado", "");
          aviso.textContent = "Este pagamento já está confirmado. O material está em Minha conta.";
          return;
        }
        gravado = {
          ok: existentes.some((item) => item.status === "aguardando"),
          pedidos: existentes.filter((item) => item.status === "aguardando"),
          mensagem: "Não foi possível reutilizar o pedido pendente.",
        };
      }
      if (!gravado.ok) {
        marcarEstado("problema", "Problema no pagamento", linkAjuda({
          txid,
          email,
          motivo: "O pedido não ficou registrado.",
        }));
        aviso.textContent = gravado.mensagem;
        return;
      }
      const oficial = totalConfirmado(ids, gravado.pedidos);
      if (!oficial) {
        marcarEstado("problema", "Problema no pagamento", linkAjuda({
          txid,
          email,
          motivo: "O preço oficial da compra não voltou do servidor.",
        }));
        aviso.textContent = "Não foi possível confirmar o preço desta compra. Atualize a página antes de gerar o Pix.";
        return;
      }
      total = oficial.total;
      if (oficial.titulos.length === 1) document.querySelector("#pix-titulo").textContent = oficial.titulos[0];
      else if (oficial.titulos.length > 1) document.querySelector("#pix-titulo").textContent = `${oficial.titulos.length} atividades`;
      document.querySelector("#pix-preco").textContent = dinheiro(total);
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
    limparTentativa(sessionStorage);
    marcarEstado("espera", "Pagamento pendente", linkAjuda({ txid, email, motivo: "Gerei o Pix e preciso de ajuda." }));
    aviso.textContent = ligada
      ? `Pague ${dinheiro(total)}. O PDF só entra em Minha conta quando este pagamento for confirmado.`
      : `Pague ${dinheiro(total)}. A conta ainda não está ligada ao banco, então o download entra quando ela estiver.`;
    if (ligada) observarPedido(dialogo, txid, lojaConta, false);
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
  const documento = dialogo.querySelector("[name=documento]");
  documento?.addEventListener("input", () => {
    documento.value = mascararDocumento(documento.value);
  });
}
