import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { destinoInterno } from "../js/rotas.js";

const sessao = readFileSync(new URL("../js/sessao.js", import.meta.url), "utf8");
const pagina = readFileSync(new URL("../diagnostico-sessao/index.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../js/diagnostico-sessao.js", import.meta.url), "utf8");

assert.match(sessao, /async diagnosticarSessao\(\)/);
assert.match(sessao, /rpc\("sessao_ainda_valida"\)/);
assert.doesNotMatch(sessao, /aal2/);
assert.doesNotMatch(script, /console\.log|access_token|localStorage|password|senha/);
assert.match(script, /diagnosticarSessao/);
assert.match(pagina, /diagnostico-sessao\.js\?v=1/);
assert.match(pagina, /noindex/);
assert.doesNotMatch(pagina, /console\.log|access_token/);
assert.equal(destinoInterno("diagnostico-sessao/", "/entrar/"), "../diagnostico-sessao/");

console.log("ok diagnóstico da sessão");
