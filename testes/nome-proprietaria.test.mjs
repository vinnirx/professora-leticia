import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const nome = "Letícia Pimentel de Macedo";
const nomeNoBanco = "LETICIA PIMENTEL MACEDO";
const paginas = ["index.html", "atividade.html", "atividades/index.html"];

for (const pagina of paginas) {
  const html = readFileSync(new URL(`../${pagina}`, import.meta.url), "utf8");
  const aviso = html.slice(html.indexOf('id="pix"'), html.indexOf('id="pix-ajuda"'));
  assert.match(aviso, /O recebedor é <strong>Letícia Pimentel de Macedo<\/strong>/);
  assert.match(aviso, /aparece como <strong>LETICIA PIMENTEL MACEDO<\/strong>/);
  assert.equal(aviso.includes("recebedor tem que ser"), false, pagina);
}

const pix = readFileSync(new URL("../js/pix.js", import.meta.url), "utf8");
assert.match(pix, /nome: "Letícia Pimentel de Macedo"/);
assert.match(pix, /limpo\.replace\(" DE ", " "\)/);
assert.match(pix, /aria-label", "QR Code do Pix de Letícia Pimentel de Macedo"/);
const normalizado = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(" DE ", " ");
assert.equal(normalizado, nomeNoBanco);
assert.equal(nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().length > 25, true);

const conta = readFileSync(new URL("../js/conta/minhas.js", import.meta.url), "utf8");
assert.match(conta, /O recebedor é Letícia Pimentel de Macedo\. No aplicativo do banco, o nome aparece como LETICIA PIMENTEL MACEDO/);
assert.match(readFileSync(new URL("../js/conta.js", import.meta.url), "utf8"), /minhas\.js\?v=22/);
assert.match(readFileSync(new URL("../minha-conta/index.html", import.meta.url), "utf8"), /conta\.js\?v=79/);

const cobranca = readFileSync(new URL("../supabase/functions/criar-cobranca/index.ts", import.meta.url), "utf8");
assert.equal(cobranca.includes(nomeNoBanco), false);
assert.equal(cobranca.includes("Letícia Pimentel de Macedo"), false);

console.log("ok nome da proprietária");
