import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { temasPorArea } from "../js/temas.js";

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const areas = ler("../js/areas.js");
const css = ler("../css/styles.css");
const inicio = ler("../js/inicio.js");
const pagina = ler("../index.html");

assert.match(inicio, /areas\.js\?v=8/);
assert.match(pagina, /inicio\.js\?v=25/);
assert.match(pagina, /styles\.css\?v=101/);
assert.match(areas, /max-width: 720px/);
assert.match(areas, /subareas-acordeao/);
assert.match(areas, /definirFiltro\(area, atual\.area === area \? atual\.tema : ""\)/);
assert.match(areas, /definirFiltro\(area, temaNovo\)/);
assert.match(areas, /coluna\.hidden = false/);
assert.doesNotMatch(areas, /uppercase|maiúscul|minlength|12 caracteres/);

const movel = css.slice(css.indexOf("@media (max-width: 720px)"));
assert.match(movel, /\.categoria-atividades\.categorias-abertas \{[^}]*width:\s*100%/s);
assert.match(movel, /\.subareas-acordeao \{[^}]*display:\s*grid/s);
assert.match(movel, /\.subareas-coluna \{\s*display:\s*none/s);
assert.match(movel, /min-height:\s*2\.75rem/);
assert.doesNotMatch(css, /\.areas:hover/);

assert.deepEqual(temasPorArea.Alfabetização.slice(0, 2), ["Vogais", "Encontros Vocálicos"]);
assert.equal(temasPorArea.Alfabetização.includes("Sílabas e Famílias Silábicas"), true);

console.log("ok menu mobile em acordeão");
