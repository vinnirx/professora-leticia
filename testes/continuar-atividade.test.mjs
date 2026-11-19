import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cadastro = readFileSync(new URL("../js/conta/cadastro.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../gerenciar/index.html", import.meta.url), "utf8");
const admin = readFileSync(new URL("../js/conta/admin.js", import.meta.url), "utf8");
const conta = readFileSync(new URL("../js/conta.js", import.meta.url), "utf8");
const painel = readFileSync(new URL("../css/painel.css", import.meta.url), "utf8");

assert.match(cadastro, /import \{ aviso \} from "\.\/avisos\.js";/);
assert.match(cadastro, /Escreva uma descrição breve, com pelo menos 10 letras\./);
assert.match(cadastro, /mostrarErroEtapa\(formulario, estado, erro\)/);
assert.doesNotMatch(cadastro, /aviso\(estado, erro\)/);
assert.match(cadastro, /aria-invalid/);
assert.match(html, /<p class="aviso-conta" id="nova-status" role="status"><\/p>\s*<div class="etapas-acoes">/);
assert.match(html, /id="etapa-seguir" type="button"/);
assert.match(html, /conta\.js\?v=62/);
assert.match(html, /painel\.css\?v=22/);
assert.match(admin, /cadastro\.js\?v=8/);
assert.match(conta, /admin\.js\?v=31/);
assert.doesNotMatch(html, /Mostrar em Materiais em destaque/);
assert.match(cadastro, /Será publicada ao confirmar/);
assert.match(cadastro, /entrou só com a senha/);
assert.match(cadastro, /destaque: false/);
assert.doesNotMatch(html, /Salvar rascunho/);
assert.match(painel, /#nova-atividade \[data-etapa="1"\] \.grade-campos/);
assert.match(painel, /\.campo-invalido input/);

console.log("ok continuar atividade");
