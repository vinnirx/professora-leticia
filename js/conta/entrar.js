import { aviso, faltaBanco } from "./avisos.js";

function destinoDepois(loja) {
  const depois = new URLSearchParams(location.search).get("depois") || sessionStorage.getItem("depois");
  sessionStorage.removeItem("depois");
  location.href = loja.destinoSeguro(depois);
}

export function iniciarEntrar(loja) {
  const entrar = document.querySelector("#form-entrar");
  const criar = document.querySelector("#form-criar");
  const painelCriar = document.querySelector("#painel-criar");
  const painelEntrar = document.querySelector("#painel-entrar");

  document.querySelector("#mostrar-criar").addEventListener("click", () => {
    painelEntrar.hidden = true;
    painelCriar.hidden = false;
  });
  document.querySelector("#mostrar-entrar").addEventListener("click", () => {
    painelCriar.hidden = true;
    painelEntrar.hidden = false;
  });

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
}
