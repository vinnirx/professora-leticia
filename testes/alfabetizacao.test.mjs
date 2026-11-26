import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { areas, temasPorArea } from "../js/temas.js";

const arquivo = (nome) => readFileSync(new URL(`../${nome}`, import.meta.url), "utf8");
const areasJs = arquivo("js/areas.js");
const catalogo = arquivo("js/catalogo.js");
const cadastro = arquivo("js/conta/cadastro.js");

assert.equal(areas.includes("Alfabetização"), true);
assert.equal(areas.includes("Vogais"), false);
assert.equal(areas.includes("Encontros Vocálicos"), false);
assert.deepEqual(temasPorArea.Alfabetização.slice(0, 2), ["Vogais", "Encontros Vocálicos"]);
assert.equal(temasPorArea.Matemática.includes("Geometria"), true);
assert.equal(temasPorArea.Matemática.includes("Formas Geométricas"), true);
assert.equal(temasPorArea.Matemática.includes("Adição"), true);
assert.equal(temasPorArea.Matemática.filter((tema) => tema === "Geometria").length, 1);
for (const tema of ["Sílabas e Famílias Silábicas", "Leitura de Palavras e Frases", "Escrita de Palavras e Frases"]) {
  assert.equal(temasPorArea.Alfabetização.includes(tema), true);
}
assert.match(catalogo, /item\.area === areaEscolhida/);
assert.match(catalogo, /item\.temas \|\| \[\]\)\.includes\(temaEscolhido\)/);
assert.match(catalogo, /return cabeArea && cabeTema/);
assert.match(areasJs, /definirFiltro\(area, atual\.area === area \? atual\.tema : ""\)/);
assert.match(areasJs, /definirFiltro\(area, temaNovo\)/);
assert.match(cadastro, /if \(temaAtual && !lista\.includes\(temaAtual\)\)/);
assert.doesNotMatch(arquivo("supabase/esquema.sql"), /create table if not exists public\.categorias/);

console.log("ok alfabetização com vogais e encontros vocálicos");
