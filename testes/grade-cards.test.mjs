import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../css/styles.css", import.meta.url), "utf8");
const grade = css.slice(css.lastIndexOf(".grade {"), css.indexOf(".card {", css.lastIndexOf(".grade {")));
assert.match(grade, /repeat\(auto-fill, minmax\(min\(100%, 15\.5rem\), 1fr\)\)/);
assert.equal(grade.includes("auto-fit"), false);

const inicioImagem = css.indexOf(".amostra-capa img {");
const imagem = css.slice(inicioImagem, css.indexOf("}", inicioImagem) + 1);
assert.match(imagem, /width:\s*100%/);
assert.match(imagem, /height:\s*100%/);
assert.match(imagem, /object-fit:\s*contain/);
assert.equal(/height:\s*\d+px/.test(imagem), false);
const capa = css.slice(css.indexOf(".amostra-capa {"), inicioImagem);
assert.match(capa, /aspect-ratio:\s*4\s*\/\s*5/);
assert.match(css, /\.card \.preco \{ margin-top: auto; \}/);
assert.equal(css.includes("line-clamp"), false);

const card = css.slice(css.lastIndexOf(".card {"), css.indexOf(".oferta {"));
assert.match(card, /border-radius:\s*1\.2rem/);
assert.match(card, /flex-direction:\s*column/);

function larguraDoCard(largura, quantidade) {
  const minimo = 15.5 * 16;
  const espaco = 16;
  const cabem = Math.max(1, Math.floor((largura + espaco) / (minimo + espaco)));
  const trilhas = Math.min(cabem, Math.max(quantidade, 1));
  const esticado = (largura - espaco * (trilhas - 1)) / trilhas;
  const reservado = (largura - espaco * (cabem - 1)) / cabem;
  return { cabem, esticado, reservado };
}

const desktop = 1080;
const um = larguraDoCard(desktop, 1);
const dois = larguraDoCard(desktop, 2);
const tres = larguraDoCard(desktop, 3);
const quatro = larguraDoCard(desktop, 4);
assert.ok(um.esticado > um.reservado);
assert.equal(um.reservado, dois.reservado);
assert.equal(dois.reservado, tres.reservado);
assert.equal(tres.reservado, quatro.reservado);
assert.ok(um.reservado <= 15.5 * 16 + 16);

const celular = Math.round(390 * 0.92);
const umCelular = larguraDoCard(celular, 1);
const tresCelular = larguraDoCard(celular, 3);
assert.equal(umCelular.cabem, 1);
assert.equal(umCelular.reservado, celular);
assert.equal(tresCelular.reservado, celular);

const catalogo = readFileSync(new URL("../js/catalogo.js", import.meta.url), "utf8");
assert.equal(catalogo.includes('className = "card"'), true);
assert.match(catalogo, /grade\.append\(cartao\(atividade\)\)/);

console.log("ok tamanho dos cards");
