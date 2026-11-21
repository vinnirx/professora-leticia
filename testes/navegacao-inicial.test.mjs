import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const inicio = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const atividades = readFileSync(new URL("../atividades/index.html", import.meta.url), "utf8");
const atividade = readFileSync(new URL("../atividade.html", import.meta.url), "utf8");
const entrar = readFileSync(new URL("../entrar/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../css/styles.css", import.meta.url), "utf8");

for (const html of [inicio, atividades, atividade, entrar]) {
  assert.doesNotMatch(html, />Início</);
  assert.doesNotMatch(html, /icones\/simbolo\.png/);
  assert.match(html, /data-conta/);
  assert.match(html, /styles\.css\?v=(91|93)/);
}

assert.match(inicio, /id="abre-carrinho"/);
assert.match(inicio, /id="busca-atividade"/);
assert.doesNotMatch(inicio, /id="titulo-categorias"/);
assert.doesNotMatch(inicio, />Categorias</);

const ordem = inicio.slice(inicio.indexOf('id="busca-atividade"'), inicio.indexOf('id="titulo-atividades"'));
assert.match(ordem, /class="categorias"/);
assert.match(ordem, /class="hero"/);
assert.ok(ordem.indexOf('class="categorias"') < ordem.indexOf('class="hero"'));

const faixa = inicio.slice(inicio.indexOf('class="categorias"'), inicio.indexOf('class="hero"'));
const nomes = faixa
  .replace(/<[^>]+>/g, "\n")
  .split("\n")
  .map((item) => item.trim())
  .filter((item) => ["Atividades", "Jogos", "Rotina escolar", "Dicas", "Gratuitos", "Materiais", "Sobre mim"].includes(item));
assert.deepEqual(nomes, ["Atividades", "Jogos", "Rotina escolar", "Dicas", "Gratuitos", "Materiais", "Sobre mim"]);
assert.match(faixa, /abre-historia/);
assert.match(faixa, /data-area="Matemática"/);
assert.match(inicio, /class="hero-banner"/);
assert.match(inicio, /Explorar Materiais/);
assert.match(css, /\.categorias ul \{[^}]*justify-content:\s*center/s);

console.log("ok navegação inicial");
