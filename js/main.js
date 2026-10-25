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
      <p>A folha que você imprime</p>
      <div class="momentos">
        <figure class="momento">
          <svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="12" fill="#f3d56a"/><g stroke="#ef8b78" stroke-width="3" stroke-linecap="round"><path d="M32 6v8M32 50v8M6 32h8M50 32h8M14 14l6 6M44 44l6 6M50 14l-6 6M20 44l-6 6"/></g></svg>
          <figcaption>Manhã</figcaption>
        </figure>
        <figure class="momento">
          <svg viewBox="0 0 64 64"><path d="M8 30 32 10l24 20v24H8Z" fill="#8ec8dc"/><rect x="26" y="34" width="12" height="20" rx="1" fill="#fffdfb"/><circle cx="32" cy="28" r="3.5" fill="#ef8b78"/></svg>
          <figcaption>Escola</figcaption>
        </figure>
        <figure class="momento">
          <svg viewBox="0 0 64 64"><circle cx="30" cy="32" r="14" fill="#f3d56a"/><circle cx="38" cy="28" r="12" fill="#fff8ee"/><circle cx="16" cy="16" r="1.4" fill="#6f94ae"/><circle cx="48" cy="18" r="1.2" fill="#6f94ae"/><circle cx="50" cy="40" r="1.3" fill="#ef8b78"/></svg>
          <figcaption>Noite</figcaption>
        </figure>
      </div>
      <p class="amostra-fala">O que vem agora?</p>
    </div>
    <div class="oferta">
      <p class="chapeu">${atividade.uso}</p>
      <h3>${atividade.titulo}</h3>
      <p class="resumo">${atividade.resumo}</p>
      <ul class="inclui">
        ${atividade.inclui.map((item) => `<li>${item}</li>`).join("")}
      </ul>
      <p class="preco">${dinheiro(atividade.preco)}</p>
      <button class="botao comprar" type="button">Quero imprimir essa folha</button>
      <details class="liberar">
        <summary>Já recebi o código</summary>
        <form>
          <label>
            Código da Letícia
            <input name="codigo" autocomplete="off" spellcheck="false" />
          </label>
          <button class="botao" type="submit">Abrir minha folha</button>
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

function abrirPix(atividade) {
  const pedido = document.querySelector("#pix-pedido");
  const resultado = document.querySelector("#pix-resultado");
  const aviso = document.querySelector("#pix-aviso");
  const copiar = document.querySelector("#copiar");
  const whatsapp = document.querySelector("#whatsapp");

  document.querySelector("#pix-titulo").textContent = atividade.titulo;
  document.querySelector("#pix-preco").textContent = dinheiro(atividade.preco);
  document.querySelector("#pix-resumo").hidden = false;
  document.querySelector("#pix-resumo").textContent = atividade.resumo;
  document.querySelector("#pix-inclui").hidden = false;
  document.querySelector("#pix-inclui").innerHTML = atividade.inclui.map((item) => `<li>${item}</li>`).join("");
  pedido.reset();
  pedido.hidden = !loja.pixChave;
  resultado.hidden = true;
  pixAtual = "";
  whatsapp.hidden = true;
  whatsapp.removeAttribute("href");
  aviso.textContent = loja.pixChave
    ? "O QR leva um código deste pedido. A Letícia vê esse código no banco dela. Esta página não recebe aviso do pagamento."
    : "A chave Pix ainda não foi cadastrada. Quando a Letícia passar a chave, o QR aparece aqui.";

  pedido.onsubmit = (evento) => {
    evento.preventDefault();
    if (!loja.pixChave) return;
    const dados = new FormData(pedido);
    const nome = String(dados.get("nome") || "").trim();
    const email = String(dados.get("email") || "").trim();
    const txid = identificadorPix();
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
    aviso.textContent = "Pague os R$ 10 e envie o comprovante com este código. A folha só abre depois que a Letícia confirmar e mandar o código de impressão.";
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
      aviso.textContent = "Pix copiado. Cole no aplicativo do banco. A folha continua travada até a Letícia confirmar.";
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
