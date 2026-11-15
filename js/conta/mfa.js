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

export function origemDoQr(valor) {
  const texto = String(valor || "");
  if (!texto.startsWith("data:image/svg+xml")) return "";
  let legivel = texto;
  try {
    legivel = decodeURIComponent(texto);
  } catch {
    return "";
  }
  if (/<script|javascript:|on\w+\s*=/i.test(legivel)) return "";
  return texto;
}

export function montarSegundoFator(loja, raiz) {
  if (!raiz || !loja?.fatorAtual) return;
  raiz.replaceChildren();
  const titulo = document.createElement("h3");
  titulo.id = "titulo-segundo-fator";
  titulo.textContent = "Segundo fator";
  const explicacao = document.createElement("p");
  explicacao.className = "texto-secao";
  explicacao.textContent = "O aplicativo autenticador protege esta conta. Cadastrá-lo não altera cargo nem permissão. O Supabase não gera código de recuperação: se o aplicativo for perdido, o fator é removido no painel do projeto, em Authentication, na conta correspondente.";
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
      mostrarEstado("O código confere.", true);
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
        imagem.alt = "QR Code do autenticador";
        imagem.width = 180;
        imagem.height = 180;
        imagem.src = origem;
        corpo.append(imagem);
      }
      const manual = document.createElement("p");
      manual.className = "texto-secao";
      manual.textContent = "Se o QR Code não abrir, digite esta chave no aplicativo. Ela aparece só agora.";
      const chave = document.createElement("p");
      chave.className = "texto-secao";
      chave.textContent = inscricao.segredo || "";
      corpo.append(manual, chave, formulario(async (codigo) => loja.confirmarFator({ factorId: inscricao.id, codigo })));
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
