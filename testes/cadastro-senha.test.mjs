import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const entrar = ler("../js/conta/entrar.js");
const sessao = ler("../js/sessao.js");
const pagina = ler("../criar-conta/index.html");
const conta = ler("../js/conta.js");

assert.match(conta, /entrar\.js\?v=15/);
assert.match(pagina, /conta\.js\?v=77/);
assert.match(pagina, /sessao\.js\?v=51/);
assert.match(pagina, /id="form-criar" novalidate/);
assert.match(pagina, /id="painel-criar" aria-labelledby="titulo-criar"/);
assert.doesNotMatch(pagina, /id="painel-criar" hidden/);
assert.match(pagina, /id="painel-entrar" hidden/);

const criar = pagina.slice(pagina.indexOf('id="painel-criar"'), pagina.indexOf('id="mostrar-entrar"'));
assert.match(criar, /name="senha"[^>]*autocomplete="new-password"/);
assert.doesNotMatch(criar, /disabled/);

const ocultos = pagina.slice(pagina.indexOf('id="painel-entrar"'), pagina.indexOf('id="painel-criar"'));
const senhasOcultas = [...ocultos.matchAll(/type="password"[^>]*>/g)].map((item) => item[0]);
assert.equal(senhasOcultas.length, 3);
for (const campo of senhasOcultas) assert.match(campo, /disabled/);

assert.match(entrar, /function valorDoCampo/);
assert.match(entrar, /campo\.disabled = !ativo/);
const envio = entrar.slice(entrar.indexOf('criar.addEventListener("submit"'), entrar.indexOf('senha.addEventListener("submit"'));
assert.match(envio, /valorDoCampo\(criar, "senha"\)/);
assert.match(envio, /senha\.length < 8/);
assert.doesNotMatch(envio, /FormData|console\.(log|debug|info|error)/);

const inicio = sessao.indexOf("function traduzir");
const fim = sessao.indexOf("async function carregarConfig");
const traduzir = new Function(`${sessao.slice(inicio, fim)}; return traduzir;`)();
assert.equal(traduzir({ message: "Password should be at least 8 characters." }), "A senha precisa de 8 caracteres ou mais.");
assert.equal(
  traduzir({ code: "weak_password", message: "Password is known to be weak and easy to guess, please choose a different one." }),
  "Esta senha é fácil de descobrir. Escolha outra, com 8 caracteres ou mais.",
);
assert.equal(
  traduzir({ message: "Signup requires a valid password" }),
  "Não foi possível usar esta senha. Escolha outra, com 8 caracteres ou mais.",
);
assert.equal(traduzir({ message: "Invalid login credentials" }), "E-mail ou senha não conferem.");
assert.doesNotMatch(
  sessao.slice(sessao.indexOf("function registrarFalhaAuth"), sessao.indexOf("function traduzir")),
  /email|senha|password/,
);

console.log("ok cadastro lê a senha do campo visível");
