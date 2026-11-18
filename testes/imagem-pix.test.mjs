import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { origemDaImagemPix } from "../js/imagem-pix.js";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
assert.equal(origemDaImagemPix(`\n${png}\n`), `data:image/png;base64,${png}`);
assert.equal(origemDaImagemPix(`data:image/png;base64,${png}`), `data:image/png;base64,${png}`);
assert.equal(origemDaImagemPix("/9j/4AAQSkZJRg=="), "data:image/jpeg;base64,/9j/4AAQSkZJRg==");
assert.equal(origemDaImagemPix("PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg=="), "");
assert.equal(origemDaImagemPix("data:image/svg+xml;base64,PHN2Zw=="), "");
assert.equal(origemDaImagemPix(""), "");

for (const pagina of ["index.html", "atividade.html", "atividades/index.html", "minha-conta/index.html"]) {
  const html = readFileSync(new URL(`../${pagina}`, import.meta.url), "utf8");
  assert.match(html, /img-src 'self' data: https:\/\/\*\.supabase\.co/);
  assert.match(html, /script-src 'self'/);
  assert.doesNotMatch(html, /script-src[^;"]*data:/);
}

console.log("ok imagem do pix");
