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

function cartao(atividade) {
  const artigo = document.createElement("article");
  artigo.className = "card";
  artigo.innerHTML = `
    <div class="amostra" aria-hidden="true">
      <p>A atividade que você imprime</p>
      <div class="momentos">
        <figure class="momento">
          <svg viewBox="0 0 64 64"><circle cx="16" cy="22" r="6" fill="#ef8b78"/><circle cx="32" cy="22" r="6" fill="#f3d56a"/><circle cx="48" cy="22" r="6" fill="#8ec8dc"/><circle cx="24" cy="42" r="6" fill="#a8c96a"/><circle cx="40" cy="42" r="6" fill="#f3a56a"/></svg>
          <figcaption>Contar</figcaption>
        </figure>
        <figure class="momento">
          <svg viewBox="0 0 64 64"><path d="M30 14h4v36h-4zM14 30h36v4H14z" fill="#5f87d8"/></svg>
          <figcaption>Somar</figcaption>
        </figure>
        <figure class="momento">
          <svg viewBox="0 0 64 64"><text x="32" y="42" text-anchor="middle" font-size="26" font-family="Nunito, sans-serif" font-weight="800" fill="#6d8a48">20</text></svg>
          <figcaption>Até 20</figcaption>
        </figure>
      </div>
      <p class="amostra-fala">Quantos tem ao todo?</p>
    </div>
    <div class="oferta">
      <p class="chapeu">${atividade.uso}</p>
      <h3>${atividade.titulo}</h3>
      <p class="resumo">${atividade.resumo}</p>
      <ul class="inclui">
        ${atividade.inclui.map((item) => `<li>${item}</li>`).join("")}
      </ul>
      <p class="preco">${dinheiro(atividade.preco)}</p>
      <button class="botao comprar" type="button">Quero essa atividade</button>
      <details class="liberar">
        <summary>Já recebi o código</summary>
        <form>
          <label>
            Código da Letícia
            <input name="codigo" autocomplete="off" spellcheck="false" />
          </label>
          <button class="botao" type="submit">Abrir minha atividade</button>
          <p class="aviso" role="status"></p>
        </form>
      </details>
    </div>
  `;
  artigo.querySelector(".comprar").addEventListener("click", () => abrirPix(atividade));
  artigo.querySelector(".liberar form").addEventListener("submit", (evento) => {
    evento.preventDefault();
    destravar(atividade, artigo);
  });
  return artigo;
}

async function destravar(atividade, artigo) {
  const aviso = artigo.querySelector(".aviso");
  const codigo = artigo.querySelector("input").value.trim().toUpperCase();
  if (!codigo) {
    aviso.textContent = "Digite o código que a Letícia enviar depois do Pix.";
    return;
  }

  aviso.textContent = "Conferindo o código…";
  try {
    await carregarPacote();
    const pdf = await abrirPacote(lerPacote(atividade.id), codigo);
    const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = atividade.download;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    aviso.textContent = "PDF destravado. O download começou.";
  } catch {
    aviso.textContent = "Esse código não abre o PDF. Ele chega depois que a Letícia confirma o Pix.";
  }
}

function carregarPacote() {
  if (window.pacotes) return Promise.resolve();
  if (!carregarPacote.pendente) {
    carregarPacote.pendente = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "js/pacote.js?v=22";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("arquivo"));
      document.body.append(script);
    });
  }
  return carregarPacote.pendente;
}

function lerPacote(id) {
  const base = pacotes[id];
  if (!base) throw new Error("arquivo");
  const binario = atob(base);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function abrirPacote(pacote, codigo) {
  const salt = pacote.slice(0, 16);
  const iv = pacote.slice(16, 28);
  const fechado = pacote.slice(28);
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(codigo),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const chave = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const aberto = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, chave, fechado);
  const pdf = new Uint8Array(aberto);
  const cabeca = String.fromCharCode(...pdf.slice(0, 5));
  if (cabeca !== "%PDF-") throw new Error("pdf");
  return pdf;
}

let pixAtual = "";

async function abrirPix(atividade) {
  const lojaConta = window.contaPronta ? await window.contaPronta : null;
  const ligada = Boolean(lojaConta?.configurada);
  let sessao = null;
  if (ligada) {
    sessao = await lojaConta.sessao();
    if (!sessao) {
      sessionStorage.setItem("depois", "index.html#atividades");
      location.href = "entrar.html?depois=index.html%23atividades";
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
    aviso.textContent = ligada
      ? "Pague os R$ 10 e envie o comprovante com este código. Quando a Letícia confirmar o Pix, a atividade aparece em Minha conta."
      : "Pague os R$ 10 e envie o comprovante com este código. A folha só abre depois que a Letícia confirmar e mandar o código de impressão.";
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
      aviso.textContent = ligada
        ? "Pix copiado. Cole no aplicativo do banco. A atividade entra na sua conta quando a Letícia confirmar."
        : "Pix copiado. Cole no aplicativo do banco. A folha continua travada até a Letícia confirmar.";
    } catch {
      campo.focus();
      campo.select();
      aviso.textContent = "Não foi possível copiar sozinho. O código está selecionado para você copiar.";
    }
  };

  dialogo.showModal();
}

document.querySelector("#pix .fechar").addEventListener("click", () => dialogo.close());

loja.atividades.forEach((atividade) => grade.append(cartao(atividade)));
