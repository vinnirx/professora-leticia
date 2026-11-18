import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { acaoVoltar, destinoDaLoja } from "../js/voltar-loja.js";

const termos = "https://inclusaonocotidiano.com.br/termos/";
const inicio = "https://inclusaonocotidiano.com.br/";
const loja = "https://inclusaonocotidiano.com.br/atividade.html?id=celulas";
const checkout = "https://inclusaonocotidiano.com.br/?carrinho=1";

assert.equal(destinoDaLoja(termos, "").href, inicio);
assert.equal(destinoDaLoja(termos, "").historico, false);
assert.equal(destinoDaLoja(termos, loja).href, loja);
assert.equal(destinoDaLoja(termos, checkout).historico, true);
assert.equal(destinoDaLoja(termos, "https://exemplo.test/fora").historico, false);
assert.equal(destinoDaLoja(termos, "javascript:alert(1)").historico, false);
assert.equal(destinoDaLoja(termos, termos).historico, false);

assert.equal(acaoVoltar(destinoDaLoja(termos, ""), 1), "inicio");
assert.equal(acaoVoltar(destinoDaLoja(termos, loja), 2), "historico");
assert.equal(acaoVoltar(destinoDaLoja(termos, loja), 1), "referenciador");
assert.equal(acaoVoltar(destinoDaLoja(termos, "https://exemplo.test/fora"), 4), "inicio");

const paginas = ["termos/index.html", "privacidade/index.html", "reembolso/index.html"];
const textos = [
  "A loja vende materiais pedagógicos digitais em PDF",
  "A conta guarda o nome e o e-mail necessários",
  "Os materiais comercializados são produtos digitais disponibilizados em PDF",
];
paginas.forEach((pagina, indice) => {
  const html = readFileSync(new URL(`../${pagina}`, import.meta.url), "utf8");
  assert.match(html, /data-voltar-loja/);
  assert.match(html, /Voltar à loja/);
  assert.match(html, /voltar-loja\.js\?v=1/);
  assert.match(html, /styles\.css\?v=88/);
  assert.match(html, new RegExp(textos[indice]));
  assert.equal(html.includes("href=\"https://"), false);
});

const css = readFileSync(new URL("../css/styles.css", import.meta.url), "utf8");
assert.match(css, /\.voltar-loja \{[^}]*border-radius: 999px/s);
assert.match(css, /\.voltar-loja \{[^}]*width: fit-content/s);

console.log("ok voltar à loja");
