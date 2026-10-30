const grade = document.querySelector("#grade");
const dialogo = document.querySelector("#pix");
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const capas = {
  "Casa e sala": "capa-ceu",
  Comunicação: "capa-sol",
  Matemática: "capa-verde",
  Emoções: "capa-coral",
  Leitura: "capa-azul",
  Pacote: "capa-pessego",
};

function dinheiro(valor) {
  return moeda.format(valor);
}

function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (caractere) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[caractere]);
}

function linhas(texto) {
  return String(texto || "").split(/\n+/).map((item) => item.trim()).filter(Boolean);
}

function paraCartao(item) {
  return {
    id: item.id,
    titulo: item.titulo,
    uso: item.uso || "AEE e sala regular",
    resumo: item.resumo || "",
    inclui: Array.isArray(item.inclui) ? item.inclui : linhas(item.inclui),
    preco: Number(item.preco),
    download: item.arquivo || item.download,
    pagina: `atividade.html?id=${encodeURIComponent(item.id)}`,
    explicacao: item.explicacao || "",
    habilidades: Array.isArray(item.habilidades) ? item.habilidades : linhas(item.habilidades),
  };
}

function cartao(atividade) {
  const artigo = document.createElement("article");
  artigo.className = "card";
  artigo.innerHTML = `
    <div class="amostra amostra-capa">
      <img src="img/capa-adicao.png?v=2" alt="Folhas da atividade com lápis, morangos, flores, bolas e passarinhos." />
    </div>
    <div class="oferta">
      <p class="chapeu">${escapar(atividade.uso)}</p>
      <h3><a href="${atividade.pagina}">${escapar(atividade.titulo)}</a></h3>
      <p class="resumo">${escapar(atividade.resumo)}</p>
      <ul class="inclui">
        ${(atividade.inclui || []).map((item) => `<li>${escapar(item)}</li>`).join("")}
      </ul>
      <p class="preco">${dinheiro(atividade.preco)}</p>
      <a class="botao comprar" href="${atividade.pagina}">Ver Atividade</a>
    </div>
  `;
  if (atividade.id !== "adicao") artigo.querySelector(".amostra")?.remove();
  if (!(atividade.inclui || []).length) artigo.querySelector(".inclui")?.remove();
  return artigo;
}

let pixAtual = "";

async function abrirPix(atividade) {
  const lojaConta = window.contaPronta ? await window.contaPronta : null;
  const ligada = Boolean(lojaConta?.configurada);
  let sessao = null;
  if (ligada) {
    sessao = await lojaConta.sessao();
    if (!sessao) {
      const volta = /atividade\.html$/.test(location.pathname)
        ? `atividade.html${location.search}`
        : "index.html#atividades";
      sessionStorage.setItem("depois", volta);
      location.href = `entrar.html?depois=${encodeURIComponent(volta)}`;
      return;
    }
  }

  const pedido = document.querySelector("#pix-pedido");
  const resultado = document.querySelector("#pix-resultado");
  const aviso = document.querySelector("#pix-aviso");
  const copiar = document.querySelector("#copiar");
  const whatsapp = document.querySelector("#whatsapp");
  const nomeInput = pedido.querySelector('[name="nome"]');
  const emailInput = pedido.querySelector('[name="email"]');

  document.querySelector("#pix-titulo").textContent = atividade.titulo;
  document.querySelector("#pix-preco").textContent = dinheiro(atividade.preco);
  document.querySelector("#pix-resumo").hidden = false;
  document.querySelector("#pix-resumo").textContent = atividade.resumo;
  document.querySelector("#pix-inclui").hidden = false;
  document.querySelector("#pix-inclui").innerHTML = atividade.inclui.map((item) => `<li>${item}</li>`).join("");
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
  pedido.hidden = !loja.pixChave;
  resultado.hidden = true;
  pixAtual = "";
  whatsapp.hidden = true;
  whatsapp.removeAttribute("href");
  aviso.textContent = loja.pixChave
    ? "O QR leva um código deste pedido. A Letícia vê esse código no banco dela. Esta página não recebe aviso do pagamento."
    : "A chave Pix ainda não foi cadastrada. Quando a Letícia passar a chave, o QR aparece aqui.";

  pedido.onsubmit = async (evento) => {
    evento.preventDefault();
    if (!loja.pixChave) return;
    const dados = new FormData(pedido);
    const nome = String(dados.get("nome") || "").trim();
    const email = String(dados.get("email") || "").trim();
    const txid = identificadorPix();
    if (ligada) {
      const gravado = await lojaConta.registrarPedido(atividade.id, txid);
      if (!gravado.ok) {
        aviso.textContent = gravado.mensagem;
        return;
      }
    }
    pixAtual = montarPix({
      chave: loja.pixChave,
      nome: loja.pixNome,
      cidade: loja.pixCidade,
      valor: atividade.preco,
      txid,
    });
    document.querySelector("#pix-imagem").innerHTML = qrSvg(pixAtual);
    document.querySelector("#pix-codigo").textContent = txid;
    document.querySelector("#pix-pessoa").textContent = `${nome} · ${email}`;
    document.querySelector("#pix-cola").value = pixAtual;
    document.querySelector("#pix-resumo").hidden = true;
    document.querySelector("#pix-inclui").hidden = true;
    pedido.hidden = true;
    resultado.hidden = false;
    aviso.textContent = "Pague os R$ 10 e envie o comprovante com este código. Quando a Letícia confirmar o Pix, o download aparece em Minha conta.";
    if (loja.whatsapp) {
      const texto = encodeURIComponent(
        `Olá, Letícia. Segue o comprovante do Pix da atividade ${atividade.titulo} (${dinheiro(atividade.preco)}). Código do pedido: ${txid}. Meu e-mail: ${email}.`,
      );
      whatsapp.hidden = false;
      whatsapp.href = `https://wa.me/${loja.whatsapp}?text=${texto}`;
    }
  };

  copiar.onclick = async () => {
    if (!pixAtual) return;
    const campo = document.querySelector("#pix-cola");
    try {
      await navigator.clipboard.writeText(pixAtual);
      aviso.textContent = "Pix copiado. Cole no aplicativo do banco. O download entra em Minha conta quando a Letícia confirmar.";
    } catch {
      campo.focus();
      campo.select();
      aviso.textContent = "Não foi possível copiar sozinho. O código está selecionado para você copiar.";
    }
  };

  dialogo.showModal();
}

if (dialogo) {
  document.querySelector("#pix .fechar").addEventListener("click", () => dialogo.close());
}

document.addEventListener("DOMContentLoaded", montarLoja);

async function montarLoja() {
  if (!grade) return;
  let lista = loja.atividades.map(paraCartao);
  if (window.contaPronta) {
    const conta = await window.contaPronta;
    if (conta?.configurada) {
      try {
        const remotas = await conta.atividades();
        if (remotas.length) lista = remotas.map(paraCartao);
      } catch {
        lista = loja.atividades.map(paraCartao);
      }
    }
  }
  grade.replaceChildren();
  lista.forEach((atividade) => grade.append(cartao(atividade)));
}

