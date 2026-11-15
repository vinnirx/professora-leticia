import { emSecao } from "./rotas.js";

const OFICIAL = "https://inclusaonocotidiano.com.br/recuperar-senha/";
const ANTIGO = "https://vinnirx.github.io/professora-leticia/recuperar-senha/";
const CONFIRMAR_OFICIAL = "https://inclusaonocotidiano.com.br/entrar/";
const CONFIRMAR_ANTIGO = "https://vinnirx.github.io/professora-leticia/entrar/";

export const MENSAGEM_CONFIRMACAO = "Enviamos um código de 6 números para seu e-mail. Verifique sua caixa de entrada e também o spam.";

export function enderecoDeRecuperacao(pagina) {
  const atual = new URL(pagina);
  if (atual.hostname === "vinnirx.github.io") return ANTIGO;
  if (atual.hostname === "inclusaonocotidiano.com.br" || atual.hostname === "www.inclusaonocotidiano.com.br") return OFICIAL;
  const partes = atual.pathname.split("/").filter(Boolean);
  if (emSecao(atual.pathname) || partes.at(-1)?.includes(".")) partes.pop();
  const base = `${atual.origin}/${partes.join("/")}${partes.length ? "/" : ""}`;
  return new URL("recuperar-senha/", base).href;
}

export function enderecoDeConfirmacao(pagina) {
  const atual = new URL(pagina);
  if (atual.hostname === "vinnirx.github.io") return CONFIRMAR_ANTIGO;
  if (atual.hostname === "inclusaonocotidiano.com.br" || atual.hostname === "www.inclusaonocotidiano.com.br") return CONFIRMAR_OFICIAL;
  const partes = atual.pathname.split("/").filter(Boolean);
  if (emSecao(atual.pathname) || partes.at(-1)?.includes(".")) partes.pop();
  const base = `${atual.origin}/${partes.join("/")}${partes.length ? "/" : ""}`;
  return new URL("entrar/", base).href;
}
