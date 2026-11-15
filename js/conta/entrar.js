import { aviso, faltaBanco } from "./avisos.js";
import { pedidoDeEntrada } from "./apresentacao.js?v=2";
import { MENSAGEM_CONFIRMACAO } from "../endereco-publico.js";
import { codigoNumerico } from "./codigo.js";
import { desafiarFator } from "./mfa.js?v=4";
import { rota } from "../rotas.js";

async function destinoDepois(loja) {
  const bruto = new URLSearchParams(location.search).get("depois") || sessionStorage.getItem("depois");
  sessionStorage.removeItem("depois");
  const depois = String(bruto || "").trim();
  let dados = null;
  if (!depois) {
    try {
      dados = await loja.perfil();
    } catch {
      dados = null;
    }
  }
  location.href = loja.destinoSeguro(pedidoDeEntrada(dados, depois));
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
  const rotulo = document.createElement("label");
  rotulo.textContent = "Código de 6 números";
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
  caixa.append(rotulo, botao);
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
    const status = entrar.querySelector(".aviso-conta");
    const dados = new FormData(entrar);
    const senha = String(dados.get("senha") || "");
    if (senha.length < 8) {
      aviso(status, "A senha precisa de 8 caracteres ou mais.");
      return;
    }
    if (!loja.configurada) {
      faltaBanco(status);
      return;
    }
    const resultado = await loja.entrar({
      email: String(dados.get("email") || "").trim(),
      senha,
    });
    if (!resultado.ok) {
      aviso(status, resultado.mensagem);
      if (/confirme o e-mail/i.test(resultado.mensagem || "")) {
        sessionStorage.setItem("email-conta", String(dados.get("email") || "").trim());
        const formulario = status.closest("form");
        formulario.insertAdjacentElement("afterend", reenvio);
        reenvio.insertAdjacentElement("afterend", codigo);
        reenvio.hidden = false;
        codigo.hidden = false;
      }
      return;
    }
    const segurou = await desafiarFator(loja, entrar, () => destinoDepois(loja));
    if (!segurou) destinoDepois(loja);
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
    const email = String(new FormData(senha).get("email") || "").trim();
    if (!email) {
      aviso(status, "Escreva o e-mail da conta.");
      return;
    }
    if (!loja.configurada) {
      faltaBanco(status);
      return;
    }
    const botao = senha.querySelector("button");
    botao.disabled = true;
    const resultado = await loja.pedirNovaSenha(email);
    botao.disabled = false;
    if (!resultado.ok) {
      aviso(status, resultado.mensagem);
      return;
    }
    aviso(status, "Se esse e-mail tiver conta, o link chega em alguns minutos. Olhe também o spam.", true);
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
    botao.disabled = true;
    const resultado = await loja.definirNovaSenha(escolhida);
    if (!resultado.ok) {
      botao.disabled = false;
      aviso(status, resultado.mensagem);
      return;
    }
    aviso(status, "Senha salva.", true);
    destinoDepois(loja);
  });
}
