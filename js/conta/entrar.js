import { aviso, faltaBanco } from "./avisos.js";

function destinoDepois(loja) {
  const depois = new URLSearchParams(location.search).get("depois") || sessionStorage.getItem("depois");
  sessionStorage.removeItem("depois");
  location.href = loja.destinoSeguro(depois);
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

  document.querySelector("#mostrar-criar").addEventListener("click", () => mostrarPainel("painel-criar"));
  document.querySelector("#mostrar-entrar").addEventListener("click", () => mostrarPainel("painel-entrar"));
  document.querySelector("#mostrar-senha").addEventListener("click", () => {
    const destino = senha.querySelector("[name=email]");
    destino.value = entrar.querySelector("[name=email]").value;
    mostrarPainel("painel-senha");
    destino.focus();
  });
  document.querySelector("#senha-voltar").addEventListener("click", () => mostrarPainel("painel-entrar"));

  if (loja?.linkVencido) {
    mostrarPainel("painel-senha");
    aviso(senha.querySelector(".aviso-conta"), "Esse link expirou. Peça outro.");
  } else if (loja?.recuperando) {
    mostrarPainel("painel-nova");
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
      return;
    }
    destinoDepois(loja);
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
      return;
    }
    if (resultado.confirmarEmail) {
      aviso(status, "Conta criada. Confirme o e-mail e depois entre.", true);
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
