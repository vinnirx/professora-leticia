import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { avisoListaContas, mensagemFator, origemDoQr, resultadoDaConfirmacao } from "../js/conta/mfa.js";

const raiz = new URL("..", import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), "utf8");
const sessao = ler("js/sessao.js");
const admin = ler("js/conta/admin.js");
const mfa = ler("js/conta/mfa.js");
const sql = ler("supabase/migracao-sessao-ativa.sql");

const sair = sessao.slice(sessao.indexOf("async sair()"), sessao.indexOf("async fatorAtual"));
assert.ok(sair.indexOf('signOut({ scope: "global" })') < sair.indexOf("email-conta"));
assert.doesNotMatch(sair, /setTimeout/);
assert.match(sair, /ok: false/);

const operacoes = [
  ["definir_papel", "async definirPapel"],
  ["definir_financeiro", "async definirFinanceiro"],
  ["confirmar_pix", "async confirmar("],
  ["criar_atividade", "async criarAtividade"],
  ["editar_campos", "async editarCampos"],
  ["definir_capa", "async definirCapa"],
];
for (const [marcador, inicio] of operacoes) {
  const pos = sessao.indexOf(marcador);
  assert.ok(pos > sessao.indexOf(inicio), marcador);
  assert.match(sessao.slice(sessao.indexOf(inicio), pos), /usuarioConfirmado/, marcador);
}
for (const inicio of ["async referenciaPdfDisponivel", "async substituirPdf", "async restaurarPdf"]) {
  const pos = sessao.indexOf(inicio);
  const proxima = sessao.indexOf("definir_arquivo", pos);
  assert.match(sessao.slice(pos, proxima), /usuarioConfirmado/, inicio);
}
const inscricao = sessao.slice(sessao.indexOf("async iniciarFator"), sessao.indexOf("mfa.enroll"));
assert.match(inscricao, /contaAdministra/);
assert.doesNotMatch(inscricao, /definir_papel/);
assert.doesNotMatch(mfa, /definir_papel|acesso_financeiro/);
assert.match(mfa, /Remover autenticador para trocar o aplicativo/);
assert.match(mfa, /Authentication/);
assert.doesNotMatch(sql, /aal2/);
assert.doesNotMatch(sessao, /aal2/);
assert.doesNotMatch(admin, /aal2/);
assert.doesNotMatch(ler("supabase/migracao-permissoes.sql"), /sessao_ainda_valida/);

assert.ok(admin.indexOf("usuarioConfirmado") < admin.indexOf("loja.perfil()"));
assert.ok(admin.indexOf("if (!administra(dados?.papel))") < admin.indexOf("loja.painel()"));
assert.doesNotMatch(admin, /desafiarFator|montarSegundoFator/);
const entrar = ler("js/conta/entrar.js");
const login = entrar.slice(entrar.indexOf("loja.entrar"), entrar.indexOf("criar.addEventListener"));
assert.doesNotMatch(login, /desafiarFator/);
assert.ok(login.indexOf("administra") < login.lastIndexOf("destinoDepois"));
assert.equal(mfa.includes("console.log"), false);
assert.match(mfa, /não oferece outro código/);

assert.equal(origemDoQr("javascript:alert(1)"), "");
assert.equal(origemDoQr("data:image/svg+xml;utf-8,<svg><script>alert(1)</script></svg>"), "");
assert.equal(origemDoQr('data:image/svg+xml;utf-8,<svg onload=alert(1)></svg>'), "");
const qr = origemDoQr('data:image/svg+xml;utf-8,<svg fill="%23000"></svg>');
assert.match(qr, /^data:image\/svg\+xml;base64,/);
assert.doesNotMatch(qr, /utf-8|fill=/);
assert.match(atob(qr.slice(qr.indexOf(",") + 1)), /<svg/);
assert.match(mfa, /Cancelar cadastro/);
assert.equal(mfa.includes("innerHTML"), false);
assert.match(inscricao, /Remova o atual/);
assert.match(mensagemFator({ message: "MFA enroll is disabled" }), /ainda não está ligado/);
assert.match(mensagemFator({ message: "Invalid TOTP code" }), /não confere/);
assert.equal(resultadoDaConfirmacao({ fatores: [{ id: "1", factor_type: "totp", status: "verified" }], nivel: "aal2" }).ok, true);
assert.equal(resultadoDaConfirmacao({ fatores: [{ id: "1", factor_type: "totp", status: "verified" }], nivel: "aal1" }).ok, false);
assert.equal(resultadoDaConfirmacao({ fatores: [{ id: "1", factor_type: "totp", status: "unverified" }], nivel: "aal2" }).ok, false);
assert.equal(resultadoDaConfirmacao({ fatores: [], nivel: "aal2" }).ok, false);
const confirmacao = sessao.slice(sessao.indexOf("async confirmarFator"), sessao.indexOf("async removerFator"));
assert.ok(confirmacao.indexOf("mfa.verify") < confirmacao.indexOf("listFactors"));
assert.match(confirmacao, /resultadoDaConfirmacao/);
assert.match(confirmacao, /factorId/);
assert.doesNotMatch(mfa, /O código confere/);
assert.equal(avisoListaContas({ ok: true, atual: "aal2" }), "");
assert.equal(avisoListaContas({ ok: true, atual: "aal1" }), "");
assert.equal(avisoListaContas({ ok: true, atual: "aal1", fatores: [] }), "");
assert.equal(avisoListaContas({ ok: true, atual: "aal1", fatores: [{ factor_type: "totp", status: "verified" }] }), "");
assert.match(avisoListaContas({ ok: false }), /incompleta/);
assert.match(sessao, /factor_type: fator\.factor_type, status: fator\.status/);
assert.doesNotMatch(sessao.slice(sessao.indexOf("async nivelAcesso"), sessao.indexOf("async iniciarFator")), /secret|qr_code/);
assert.match(admin, /Excluir definitivamente/);
assert.match(admin, /lista-atividades-simples/);
assert.doesNotMatch(admin, /aal2/);

console.log("ok mfa administrativo");
