import { emSecao } from "./rotas.js";

const OFICIAL = "https://inclusaonocotidiano.com.br/recuperar-senha/";
const ANTIGO = "https://vinnirx.github.io/professora-leticia/recuperar-senha/";

export function enderecoDeRecuperacao(pagina) {
  const atual = new URL(pagina);
  if (atual.hostname === "vinnirx.github.io") return ANTIGO;
  if (atual.hostname === "inclusaonocotidiano.com.br" || atual.hostname === "www.inclusaonocotidiano.com.br") return OFICIAL;
  const partes = atual.pathname.split("/").filter(Boolean);
  if (emSecao(atual.pathname) || partes.at(-1)?.includes(".")) partes.pop();
  const base = `${atual.origin}/${partes.join("/")}${partes.length ? "/" : ""}`;
  return new URL("recuperar-senha/", base).href;
}
