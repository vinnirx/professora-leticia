import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decidirEntrada } from "../js/conta/mfa.js";
import { destinoInterno } from "../js/rotas.js";
import { pedidoDeEntrada } from "../js/conta/apresentacao.js";

const cliente = { ok: false, mensagem: "O segundo fator desta tela é só de quem administra a loja." };
const semFator = { ok: true, atual: "aal1", proximo: "aal1" };
const comFator = { ok: true, atual: "aal1", proximo: "aal2" };
const jaConfirmado = { ok: true, atual: "aal2", proximo: "aal2" };
const sessaoRuim = { ok: false, mensagem: "Esta sessão não está mais ativa. Entre de novo." };
const leituraRuim = { ok: false, fator: null, mensagem: "Não consegui ler o autenticador. Tente de novo." };
const fator = { id: "fator-ficticio" };

assert.equal(decidirEntrada({ nivel: cliente, fatores: null }).acao, "seguir");
assert.equal(decidirEntrada({ nivel: semFator, fatores: null }).acao, "seguir");
assert.equal(decidirEntrada({ nivel: jaConfirmado, fatores: null }).acao, "seguir");
assert.equal(decidirEntrada({ nivel: comFator, fatores: { ok: true, fator } }).acao, "desafiar");
assert.equal(decidirEntrada({ nivel: comFator, fatores: { ok: true, fator: null } }).acao, "seguir");
assert.equal(decidirEntrada({ nivel: comFator, fatores: leituraRuim }).acao, "falha");
assert.equal(decidirEntrada({ nivel: sessaoRuim, fatores: { ok: true, fator: null } }).acao, "seguir");
assert.equal(decidirEntrada({ nivel: sessaoRuim, fatores: { ok: true, fator } }).acao, "desafiar");
assert.equal(decidirEntrada({ nivel: sessaoRuim, fatores: leituraRuim }).acao, "falha");
assert.match(decidirEntrada({ nivel: sessaoRuim, fatores: leituraRuim }).mensagem, /Entre de novo/);
assert.match(decidirEntrada({ nivel: comFator, fatores: leituraRuim }).mensagem, /autenticador/);

const administrador = { papel: "admin" };
const proprietaria = { papel: "owner" };
assert.equal(destinoInterno(pedidoDeEntrada(administrador, ""), "/entrar/"), "../gerenciar/");
assert.equal(destinoInterno(pedidoDeEntrada(proprietaria, ""), "/entrar/"), "../gerenciar/");
assert.equal(destinoInterno(pedidoDeEntrada({ papel: "cliente" }, ""), "/entrar/"), "../minha-conta/");

const raiz = new URL("..", import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), "utf8");
const entrar = ler("js/conta/entrar.js");
const sessao = ler("js/sessao.js");
const mfa = ler("js/conta/mfa.js");
const pagina = ler("entrar/index.html");
const recuperar = ler("recuperar-senha/index.html");

const login = entrar.slice(entrar.indexOf("loja.entrar"), entrar.indexOf("criar.addEventListener"));
assert.match(login, /catch/);
assert.match(login, /Não consegui entrar agora/);
assert.match(login, /resultado\?\.mensagem/);
assert.match(login, /passo === "falha"/);
assert.match(login, /passo === "desafio"/);
assert.match(entrar, /location\.assign/);
assert.match(entrar, /data-continuar/);
assert.equal(login.includes("console.log"), false);
assert.match(sessao, /load failed/);
assert.match(sessao, /session or user missing/);
assert.match(mfa, /decidirEntrada/);
assert.equal(mfa.includes("console.log"), false);
const codigo = mfa.slice(mfa.indexOf("Confirmar código"), mfa.indexOf('return "desafio"'));
assert.match(codigo, /O código não confere/);
assert.match(codigo, /botao\.disabled = false/);
assert.match(pagina, /form id="form-entrar" novalidate/);
assert.match(recuperar, /form id="form-senha" novalidate/);
const recuperacao = entrar.slice(entrar.indexOf("pedirNovaSenha"), entrar.indexOf("definirNovaSenha"));
assert.match(recuperacao, /catch/);
assert.match(recuperacao, /finally/);
assert.match(recuperacao, /botao\.disabled = false/);

console.log("ok login do administrador");
