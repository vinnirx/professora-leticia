import { aviso, faltaBanco } from "./avisos.js";
import { pedidoDeEntrada } from "./apresentacao.js?v=2";
import { MENSAGEM_CONFIRMACAO } from "../endereco-publico.js";
import { codigoNumerico } from "./codigo.js";
import { administra } from "./papeis.js";
import { rota } from "../rotas.js";

function comPrazo(promessa, milissegundos = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("tempo esgotado")), milissegundos);
    Promise.resolve(promessa).then(
      (valor) => {
        clearTimeout(timer);
        resolve(valor);
      },
      (erro) => {
        clearTimeout(timer);
        reject(erro);
      },
    );
  });
}

function oferecerContinuidade(destino) {
  const atual = location.href;
  setTimeout(() => {
    if (location.href !== atual || document.querySelector("[data-continuar]")) return;
    const link = document.createElement("a");
    link.className = "botao";
    link.href = destino;
    link.dataset.continuar = "sim";
    link.textContent = "Continuar";
    const status = document.querySelector(".aviso-conta");
    if (status) status.insertAdjacentElement("afterend", link);
    else document.querySelector("main")?.append(link);
  }, 1200);
}

async function destinoDepois(loja) {
  let bruto = "";
  try {
    bruto = new URLSearchParams(location.search).get("depois") || sessionStorage.getItem("depois") || "";
    sessionStorage.removeItem("depois");
  } catch {
    bruto = "";
  }
  const depois = String(bruto || "").trim();
  let dados = null;
  if (!depois) {
    try {
      dados = await loja.perfil();
    } catch {
      dados = null;
    }
  }
  const destino = new URL(loja.destinoSeguro(pedidoDeEntrada(dados, depois)), location.href).href;
  try {
    location.assign(destino);
  } catch {
    /* o link de continuidade abaixo ainda leva à página */
  }
  oferecerContinuidade(destino);
  return destino;
}

function prepararReenvio(loja, status) {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "botao botao-secundario";
  botao.textContent = "Reenviar e-mail de confirmação";
  botao.hidden = true;
  status?.insertAdjacentElement("afterend", botao);
  botao.addEventListener("click", async () => {
    const email = (sessionStorage.getItem("email-conta") || document.querySelector("#form-criar [name=email]")?.value || "").trim();
    const destino = botao.previousElementSibling;
    if (!email || !loja?.reenviarConfirmacao) {
      aviso(destino, "Escreva o e-mail para reenviar a confirmação.");
      return;
    }
    const espera = Number(sessionStorage.getItem("reenvio-confirmacao") || 0);
    if (Date.now() < espera) {
      aviso(destino, "Espere um pouco e peça o código de novo.");
      return;
    }
    botao.disabled = true;
    const resultado = await loja.reenviarConfirmacao(email);
    sessionStorage.setItem("reenvio-confirmacao", String(Date.now() + 60000));
    botao.disabled = false;
    aviso(destino, resultado.ok ? MENSAGEM_CONFIRMACAO : resultado.mensagem, resultado.ok);
  });
  return botao;
}

function prepararCodigo(loja, status) {
  const caixa = document.createElement("form");
  caixa.className = "form-codigo";
  caixa.hidden = true;
  const explicacao = document.createElement("p");
  explicacao.className = "texto-secao";
  explicacao.textContent = "Digite o código de 6 números enviado ao seu e-mail. Ele não vem do aplicativo autenticador.";
  const rotulo = document.createElement("label");
  rotulo.textContent = "Código recebido por e-mail";
  const campo = document.createElement("input");
  campo.name = "codigo";
  campo.inputMode = "numeric";
  campo.autocomplete = "one-time-code";
  campo.maxLength = 6;
  campo.required = true;
  campo.setAttribute("aria-label", "Código de 6 números");
  rotulo.append(campo);
  const botao = document.createElement("button");
  botao.className = "botao";
  botao.type = "submit";
  botao.textContent = "Confirmar código";
  caixa.append(explicacao, rotulo, botao);
  status?.closest("form")?.insertAdjacentElement("afterend", caixa);
  campo.addEventListener("input", () => {
    campo.value = codigoNumerico(campo.value);
  });
  caixa.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const email = (sessionStorage.getItem("email-conta") || "").trim();
    const resultado = await loja.confirmarCodigo({ email, codigo: campo.value });
    if (!resultado.ok) {
      aviso(status, resultado.mensagem);
      return;
    }
    aviso(status, "Sua conta foi verificada. Você já pode entrar e comprar.", true);
    caixa.hidden = true;
    destinoDepois(loja);
  });
  return caixa;
}

function mostrarPainel(nome) {
  document.querySelectorAll(".acesso-cartao").forEach((painel) => {
    painel.hidden = painel.id !== nome;
  });
}

export function iniciarEntrar(loja) {
  const entrar = document.querySelector("#form-entrar");
  const criar = document.querySelector("#form-criar");
  const senha = document.querySelector("#form-senha");
  const nova = document.querySelector("#form-nova");

  document.querySelector("#mostrar-criar")?.addEventListener("click", () => {
    const email = entrar?.querySelector("[name=email]")?.value || "";
    if (email) sessionStorage.setItem("email-conta", email);
    location.href = rota("criar-conta/");
  });
  document.querySelector("#mostrar-entrar")?.addEventListener("click", () => {
    location.href = rota("entrar/");
  });
  document.querySelector("#mostrar-senha")?.addEventListener("click", () => {
    const email = entrar?.querySelector("[name=email]")?.value || "";
    if (email) sessionStorage.setItem("email-conta", email);
    location.href = rota("recuperar-senha/");
  });
  document.querySelector("#senha-voltar")?.addEventListener("click", () => {
    location.href = rota("entrar/");
  });

  const pedido = document.body.dataset.painel || "";
  const reenvio = prepararReenvio(loja, criar?.querySelector(".aviso-conta"));
  const codigo = prepararCodigo(loja, criar?.querySelector(".aviso-conta"));
  if (loja?.confirmacaoVencida) {
    mostrarPainel("painel-criar");
    aviso(criar.querySelector(".aviso-conta"), "Esse link expirou. Peça outro e-mail de confirmação.");
    reenvio.hidden = false;
  } else if (loja?.contaVerificada) {
    mostrarPainel("painel-entrar");
    aviso(entrar.querySelector(".aviso-conta"), "Sua conta foi verificada. Você já pode entrar e comprar.", true);
  } else if (loja?.linkVencido) {
    mostrarPainel("painel-senha");
    aviso(senha.querySelector(".aviso-conta"), "Esse link expirou. Peça outro.");
  } else if (loja?.recuperando) {
    mostrarPainel("painel-nova");
  } else if (pedido === "criar") {
    mostrarPainel("painel-criar");
  } else if (pedido === "recuperar") {
    mostrarPainel("painel-senha");
  }
  const guardado = sessionStorage.getItem("email-conta") || "";
  if (guardado) {
    document.querySelectorAll('input[name="email"]').forEach((campo) => {
      if (!campo.value) campo.value = guardado;
    });
  }

  entrar.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (entrar.dataset.enviando === "1" || document.querySelector("[data-desafio-autenticador]")) return;
    const status = entrar.querySelector(".aviso-conta");
    const botao = entrar.querySelector("button");
    const dados = new FormData(entrar);
    const email = String(dados.get("email") || "").trim();
    const senha = String(dados.get("senha") || "");
    const campoEmail = entrar.querySelector("[name=email]");
    if (campoEmail && !campoEmail.checkValidity()) {
      aviso(status, "Escreva um e-mail válido.");
      return;
    }
    if (senha.length < 8) {
      aviso(status, "A senha precisa de 8 caracteres ou mais.");
      return;
    }
    if (!loja.configurada) {
      faltaBanco(status);
      return;
    }
    if (botao) botao.disabled = true;
    entrar.dataset.enviando = "1";
    aviso(status, "Entrando…");
    try {
      const resultado = await comPrazo(loja.entrar({ email, senha }));
      if (!resultado?.ok) {
        aviso(status, resultado?.mensagem || "E-mail ou senha não conferem.");
        if (/confirme o e-mail/i.test(resultado?.mensagem || "")) {
          sessionStorage.setItem("email-conta", email);
          const formulario = status.closest("form");
          formulario.insertAdjacentElement("afterend", reenvio);
          reenvio.insertAdjacentElement("afterend", codigo);
          reenvio.hidden = false;
          codigo.hidden = false;
        }
        return;
      }
      const dados = await loja.perfil();
      if (!administra(dados?.papel)) {
        await destinoDepois(loja);
        return;
      }
      await destinoDepois(loja);
    } catch {
      aviso(status, "Não consegui entrar agora. Verifique a conexão e tente de novo.");
    } finally {
      delete entrar.dataset.enviando;
      if (botao?.isConnected) botao.disabled = false;
    }
  });

  criar.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const status = criar.querySelector(".aviso-conta");
    const dados = new FormData(criar);
    const nome = String(dados.get("nome") || "").trim();
    const senha = String(dados.get("senha") || "");
    if (nome.length < 2) {
      aviso(status, "Escreva seu nome.");
      return;
    }
    if (senha.length < 8) {
      aviso(status, "A senha precisa de 8 caracteres ou mais.");
      return;
    }
    if (!loja.configurada) {
      faltaBanco(status);
      return;
    }
    const resultado = await loja.criarConta({
      nome,
      email: String(dados.get("email") || "").trim(),
      senha,
    });
    if (!resultado.ok) {
      aviso(status, resultado.mensagem);
      if (/já existe uma conta/i.test(resultado.mensagem || "")) {
        sessionStorage.setItem("email-conta", String(dados.get("email") || "").trim());
        reenvio.hidden = false;
      }
      return;
    }
    if (resultado.confirmarEmail) {
      sessionStorage.setItem("email-conta", String(dados.get("email") || "").trim());
      aviso(status, MENSAGEM_CONFIRMACAO, true);
      reenvio.hidden = false;
      codigo.hidden = false;
      return;
    }
    destinoDepois(loja);
  });

  senha.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const status = senha.querySelector(".aviso-conta");
    const campoEmail = senha.querySelector("[name=email]");
    const email = String(new FormData(senha).get("email") || "").trim();
    if (campoEmail && !campoEmail.checkValidity()) {
      aviso(status, "Escreva um e-mail válido.");
      return;
    }
    if (!email) {
      aviso(status, "Escreva o e-mail da conta.");
      return;
    }
    if (!loja.configurada) {
      faltaBanco(status);
      return;
    }
    const botao = senha.querySelector("button");
    if (botao) botao.disabled = true;
    try {
      const resultado = await comPrazo(loja.pedirNovaSenha(email));
      if (!resultado?.ok) {
        aviso(status, resultado?.mensagem || "Não consegui enviar o link. Tente de novo.");
        return;
      }
      aviso(status, "Se esse e-mail tiver conta, o link chega em alguns minutos. Olhe também o spam.", true);
    } catch {
      aviso(status, "Não consegui falar com o servidor. Verifique a conexão e tente de novo.");
    } finally {
      if (botao) botao.disabled = false;
    }
  });

  nova.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const status = nova.querySelector(".aviso-conta");
    const dados = new FormData(nova);
    const escolhida = String(dados.get("senha") || "");
    const confirma = String(dados.get("confirma") || "");
    if (escolhida.length < 8) {
      aviso(status, "A senha precisa de 8 caracteres ou mais.");
      return;
    }
    if (escolhida !== confirma) {
      aviso(status, "As duas senhas precisam ser iguais.");
      return;
    }
    if (!loja.configurada) {
      faltaBanco(status);
      return;
    }
    const botao = nova.querySelector("button");
    if (botao) botao.disabled = true;
    try {
      const resultado = await comPrazo(loja.definirNovaSenha(escolhida));
      if (!resultado?.ok) {
        aviso(status, resultado?.mensagem || "Não consegui salvar a senha. Tente de novo.");
        return;
      }
      aviso(status, "Senha salva.", true);
      await destinoDepois(loja);
    } catch {
      aviso(status, "Não consegui falar com o servidor. Verifique a conexão e tente de novo.");
    } finally {
      if (botao?.isConnected) botao.disabled = false;
    }
  });
}
