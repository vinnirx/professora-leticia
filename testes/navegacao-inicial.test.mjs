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
  assert.match(html, /styles\.css\?v=(91|93|94|95|96|97|98|99|100|101|102|103|104|105|106|107|108|109|110|111)/);
}

assert.match(inicio, /id="abre-carrinho"/);
assert.match(inicio, /id="busca-atividade"/);
assert.equal((inicio.match(/id="busca-atividade"/g) || []).length, 1);
const cabeca = inicio.slice(inicio.indexOf("<header"), inicio.indexOf("</header>"));
assert.ok(cabeca.indexOf('class="logo"') < cabeca.indexOf('id="busca-atividade"'));
assert.ok(cabeca.indexOf('id="busca-atividade"') < cabeca.indexOf('class="menu"'));
assert.match(css, /#inicio\.cabecalho \{[^}]*flex-wrap:\s*nowrap/s);
assert.match(css, /#inicio\.cabecalho \.busca,\s*#inicio\.cabecalho \.menu \{\s*margin-top:\s*57px;\s*align-self:\s*flex-start;\s*transform:\s*none;/s);
assert.match(css.slice(css.indexOf("@media (max-width: 720px)")), /#inicio\.cabecalho \{[^}]*display:\s*grid/s);
assert.match(css, /grid-template-areas:\s*"logo acoes"\s*"busca busca"/);
assert.match(css, /min-height:\s*2\.75rem/);
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
assert.match(inicio, /hero-banner\.webp\?v=2/);
assert.doesNotMatch(css, /\.hero-banner \{[^}]*width:\s*178%/s);
assert.match(inicio, /Explorar Materiais/);
assert.match(css, /\.categorias ul \{[^}]*justify-content:\s*center/s);

console.log("ok navegação inicial");
