import { dinheiro, escapar, linkAjuda } from "./texto.js";
import { itemOficial, limparCarrinho } from "./carrinho.js";

let pixAtual = "";

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
    if (!window.loja.pixChave || total == null) return;
    const dados = new FormData(pedido);
    const nome = String(dados.get("nome") || "").trim();
    const email = String(dados.get("email") || "").trim();
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
      ? `Pague ${dinheiro(total)}. O PDF só entra em Minha conta quando este pagamento for confirmado. Esta página não recebe aviso do banco.`
      : `Pague ${dinheiro(total)}. A conta ainda não está ligada ao banco, então o download entra quando ela estiver.`;
    if (/^[0-9]{10,15}$/.test(window.loja.whatsapp || "")) {
      const nomes = cobranca.map((item) => item.titulo).join(", ");
      const texto = encodeURIComponent(
        `Olá, Letícia. Segue o comprovante do Pix de ${nomes} (${dinheiro(total)}). Código do pedido: ${txid}. Meu e-mail: ${email}.`,
      );
      whatsapp.hidden = false;
      whatsapp.href = `https://wa.me/${window.loja.whatsapp}?text=${texto}`;
    }
  };

  copiar.onclick = async () => {
    if (!pixAtual || !window.payloadPixValido(pixAtual, total)) return;
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
