import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decidirPixAutomatico } from "../js/checkout.js";

const checkout = readFileSync(new URL("../js/checkout.js", import.meta.url), "utf8");
const sessao = readFileSync(new URL("../js/sessao.js", import.meta.url), "utf8");
const cobranca = readFileSync(new URL("../supabase/functions/criar-cobranca/index.ts", import.meta.url), "utf8");
const regras = readFileSync(new URL("../supabase/functions/_shared/regras.mjs", import.meta.url), "utf8");

assert.equal(decidirPixAutomatico({ estado: "sim" }), "pix");
assert.equal(decidirPixAutomatico({ estado: "nao" }), "bloqueado");
assert.equal(decidirPixAutomatico({ estado: "bloqueado" }), "bloqueado");
assert.equal(decidirPixAutomatico({ estado: "entrar" }), "entrar");
assert.equal(decidirPixAutomatico({ estado: "confirmar" }), "confirmar");
assert.equal(decidirPixAutomatico({ estado: "falha" }), "falha");
assert.equal(decidirPixAutomatico(true), "pix");
assert.equal(decidirPixAutomatico(false), "bloqueado");
assert.equal(decidirPixAutomatico({ estado: "sim", automatico: false }), "pix");

assert.match(checkout, /pixAutomaticoDisponivel\(\)/);
assert.match(checkout, /decisaoPix === "entrar"/);
assert.match(checkout, /decisaoPix === "falha"/);
assert.match(checkout, /MENSAGEM_COMPRA_INDISPONIVEL/);
assert.doesNotMatch(checkout, /cobrancaAutomatica === true/);
assert.doesNotMatch(checkout, /userAgent|Android|iPhone|instagram/i);

const autorizacao = sessao.slice(sessao.indexOf("async pixAutomaticoDisponivel"), sessao.indexOf("async criarCobranca"));
assert.match(autorizacao, /consulta: "acesso"/);
assert.match(autorizacao, /getUser\(\)/);
assert.match(autorizacao, /refreshSession\(\)/);
assert.match(autorizacao, /onAuthStateChange/);
assert.match(autorizacao, /estado: "falha"/);
assert.match(autorizacao, /return "nao"/);
assert.match(autorizacao, /return "sim"/);
assert.doesNotMatch(autorizacao, /return false|return true|cobrancaAutomatica/);

assert.match(cobranca, /consulta === "acesso"/);
assert.match(cobranca, /identificadorAutenticado/);
assert.match(cobranca, /automatico: \(modo === "teste" \|\| modo === "geral"\) && destino\.ok/);
assert.doesNotMatch(cobranca, /userAgent|mobile|Android/);
assert.match(regras, /export function acessoCobranca/);
assert.match(regras, /mesmaConta/);
assert.doesNotMatch(regras.slice(regras.indexOf("export function acessoCobranca"), regras.indexOf("export function planoConciliacao")), /userAgent|mobile/);

console.log("ok pix não depende do dispositivo");
