export function resultadoDaConfirmacao({ fatores, nivel }) {
  const verificado = (fatores || []).some((fator) => fator.factor_type === "totp" && fator.status === "verified");
  if (!verificado || nivel !== "aal2") {
    return { ok: false, mensagem: "O servidor não confirmou o autenticador. O cadastro não foi concluído." };
  }
  return { ok: true, mensagem: "O autenticador foi confirmado. Esta sessão passou pelo segundo fator." };
}

export function mensagemFator(erro) {
  const texto = String(erro?.message || erro || "");
  if (/enroll is disabled|verify is disabled|mfa.*disabled/i.test(texto)) {
    return "O segundo fator ainda não está ligado no servidor de autenticação.";
  }
  if (/invalid.*code|invalid totp/i.test(texto)) return "O código não confere.";
  if (/too many|maximum.*factor|max enrolled/i.test(texto)) {
    return "Já existe um autenticador nesta conta. Remova o atual antes de cadastrar outro.";
  }
  if (/[áàâãéêíóôõúç]/i.test(texto)) return texto;
  return "Não foi possível agora. Tente de novo.";
}

function svgDoQr(valor) {
  const texto = String(valor || "").trim();
  if (!texto.startsWith("data:image/svg+xml")) return "";
  const virgula = texto.indexOf(",");
  if (virgula < 0) return "";
  const cabecalho = texto.slice(0, virgula).toLowerCase();
  const corpo = texto.slice(virgula + 1);
  try {
    if (cabecalho.includes(";base64")) {
      const binario = atob(corpo);
      const bytes = Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(corpo);
  } catch {
    return "";
  }
}

export function origemDoQr(valor) {
  const svg = svgDoQr(valor);
  if (!svg.includes("<svg") || /<script|javascript:|on\w+\s*=/i.test(svg)) return "";
  const bytes = new TextEncoder().encode(svg);
  let binario = "";
  bytes.forEach((byte) => {
    binario += String.fromCharCode(byte);
  });
  return `data:image/svg+xml;base64,${btoa(binario)}`;
}

export function montarSegundoFator(loja, raiz) {
  if (!raiz || !loja?.fatorAtual) return;
  raiz.replaceChildren();
  const titulo = document.createElement("h3");
  titulo.id = "titulo-segundo-fator";
  titulo.textContent = "Segundo fator";
  const explicacao = document.createElement("p");
  explicacao.className = "texto-secao";
  explicacao.textContent = "O aplicativo autenticador protege esta conta. Cadastrá-lo não altera cargo nem permissão. No próximo login, a loja pede o código de 6 números. O Supabase não gera código de recuperação: com a sessão ainda aberta, use Remover autenticador. Sem sessão, o fator é removido no painel do projeto, em Authentication, na conta correspondente.";
  const nivel = document.createElement("p");
  nivel.className = "texto-secao";
  const corpo = document.createElement("div");
  const estado = document.createElement("p");
  estado.className = "aviso-conta";
  estado.hidden = true;
  raiz.append(titulo, explicacao, nivel, corpo, estado);

  const mostrarEstado = (mensagem, ok) => {
    estado.hidden = !mensagem;
    estado.textContent = mensagem || "";
    estado.classList.toggle("aviso-ok", Boolean(ok));
  };

  const formulario = (aoEnviar) => {
    const form = document.createElement("form");
    const rotulo = document.createElement("label");
    rotulo.textContent = "Código de 6 números";
    const campo = document.createElement("input");
    campo.inputMode = "numeric";
    campo.autocomplete = "one-time-code";
    campo.maxLength = 6;
    campo.required = true;
    campo.setAttribute("aria-label", "Código do autenticador");
    rotulo.append(campo);
    const botao = document.createElement("button");
    botao.className = "botao";
    botao.type = "submit";
    botao.textContent = "Confirmar código";
    form.append(rotulo, botao);
    campo.addEventListener("input", () => {
      campo.value = String(campo.value || "").replace(/\D/g, "").slice(0, 6);
    });
    form.addEventListener("submit", async (evento) => {
      evento.preventDefault();
      botao.disabled = true;
      const resultado = await aoEnviar(campo.value);
      botao.disabled = false;
      if (!resultado?.ok) {
        mostrarEstado(resultado?.mensagem || "O código não confere.");
        return;
      }
      mostrarEstado(resultado.mensagem, true);
      await carregar();
    });
    return form;
  };

  const mostrarCadastro = () => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "botao";
    botao.textContent = "Cadastrar autenticador";
    botao.addEventListener("click", async () => {
      botao.disabled = true;
      const inscricao = await loja.iniciarFator();
      if (!inscricao?.ok) {
        mostrarEstado(inscricao?.mensagem);
        botao.disabled = false;
        return;
      }
      corpo.replaceChildren();
      const origem = origemDoQr(inscricao.qr);
      if (origem) {
        const imagem = document.createElement("img");
        imagem.className = "qr-fator";
        imagem.alt = "QR Code do autenticador";
        imagem.width = 180;
        imagem.height = 180;
        imagem.src = origem;
        corpo.append(imagem);
      } else {
        const avisoQr = document.createElement("p");
        avisoQr.className = "texto-secao";
        avisoQr.textContent = "O QR Code não pôde ser exibido. Use a chave manual ou cancele para gerar outra.";
        corpo.append(avisoQr);
      }
      const manual = document.createElement("p");
      manual.className = "texto-secao";
      manual.textContent = "Se o QR Code não abrir, digite esta chave no aplicativo. Ela aparece só agora. Ao cancelar, essa chave deixa de valer.";
      const chave = document.createElement("p");
      chave.className = "chave-fator";
      chave.textContent = inscricao.segredo || "";
      const cancelar = document.createElement("button");
      cancelar.type = "button";
      cancelar.className = "botao botao-secundario";
      cancelar.textContent = "Cancelar cadastro";
      cancelar.addEventListener("click", async () => {
        cancelar.disabled = true;
        chave.textContent = "";
        const resultado = await loja.removerFator(inscricao.id);
        if (!resultado?.ok) {
          mostrarEstado(resultado?.mensagem);
          cancelar.disabled = false;
          return;
        }
        mostrarEstado("O cadastro foi cancelado. A chave anterior não vale mais.", true);
        await carregar();
      });
      corpo.append(manual, chave, formulario(async (codigo) => loja.confirmarFator({ factorId: inscricao.id, codigo })), cancelar);
    });
    corpo.append(botao);
  };

  const mostrarAtivo = (fator) => {
    const nome = document.createElement("p");
    nome.className = "texto-secao";
    nome.textContent = fator.friendly_name || "Autenticador cadastrado";
    const testar = document.createElement("button");
    testar.type = "button";
    testar.className = "botao";
    testar.textContent = "Testar código";
    const remover = document.createElement("button");
    remover.type = "button";
    remover.className = "botao botao-secundario";
    remover.textContent = "Remover autenticador";
    let confirmarRemocao = false;
    testar.addEventListener("click", () => {
      corpo.append(formulario(async (codigo) => loja.confirmarFator({ factorId: fator.id, codigo })));
      testar.disabled = true;
    });
    remover.addEventListener("click", async () => {
      if (!confirmarRemocao) {
        confirmarRemocao = true;
        remover.textContent = "Confirmar remoção";
        return;
      }
      remover.disabled = true;
      const resultado = await loja.removerFator(fator.id);
      if (!resultado?.ok) {
        mostrarEstado(resultado?.mensagem);
        remover.disabled = false;
        return;
      }
      mostrarEstado("O autenticador foi removido.", true);
      await carregar();
    });
    corpo.append(nome, testar, remover);
  };

  async function carregar() {
    corpo.replaceChildren();
    const [fatores, acesso] = await Promise.all([loja.fatorAtual(), loja.nivelAcesso()]);
    if (!fatores?.ok) {
      mostrarEstado(fatores?.mensagem);
      nivel.textContent = "";
      return;
    }
    nivel.textContent = acesso?.atual === "aal2"
      ? "Esta sessão já passou pelo segundo fator."
      : "Esta sessão ainda não passou pelo segundo fator.";
    if (fatores.fator) mostrarAtivo(fatores.fator);
    else mostrarCadastro();
  }

  carregar();
}

export async function desafiarFator(loja, ancora, aoConcluir) {
  if (!loja?.nivelAcesso || !ancora) return false;
  const nivel = await loja.nivelAcesso();
  if (!nivel?.ok) return false;
  if (nivel.atual === "aal2" || nivel.proximo !== "aal2") return false;
  const fatores = await loja.fatorAtual();
  if (!fatores?.ok || !fatores.fator) return false;

  const caixa = document.createElement("form");
  caixa.className = "form-codigo";
  const titulo = document.createElement("p");
  titulo.className = "texto-secao";
  titulo.textContent = "Informe o código do autenticador para continuar.";
  const rotulo = document.createElement("label");
  rotulo.textContent = "Código de 6 números";
  const campo = document.createElement("input");
  campo.inputMode = "numeric";
  campo.autocomplete = "one-time-code";
  campo.maxLength = 6;
  campo.required = true;
  campo.setAttribute("aria-label", "Código do autenticador");
  rotulo.append(campo);
  const botao = document.createElement("button");
  botao.className = "botao";
  botao.type = "submit";
  botao.textContent = "Confirmar código";
  const estado = document.createElement("p");
  estado.className = "aviso-conta";
  estado.hidden = true;
  const perda = document.createElement("p");
  perda.className = "texto-secao";
  perda.textContent = "O código errado não entra. Se o aplicativo foi perdido, o Supabase não oferece outro código. A remoção do fator é feita no painel do projeto, em Authentication, na conta correspondente.";
  caixa.append(titulo, rotulo, botao, estado, perda);
  campo.addEventListener("input", () => {
    campo.value = String(campo.value || "").replace(/\D/g, "").slice(0, 6);
  });
  caixa.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    botao.disabled = true;
    const resultado = await loja.confirmarFator({ factorId: fatores.fator.id, codigo: campo.value });
    botao.disabled = false;
    if (!resultado?.ok) {
      estado.hidden = false;
      estado.textContent = resultado?.mensagem || "O código não confere.";
      estado.classList.remove("aviso-ok");
      return;
    }
    await aoConcluir();
  });
  ancora.insertAdjacentElement("afterend", caixa);
  return true;
}
