import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { administra, perfilDaSessao } from "../js/conta/papeis.js";

const raiz = new URL("..", import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), "utf8");

const dona = "dona-ficticia";
const cliente = "cliente-ficticio";
assert.equal(perfilDaSessao(cliente, { id: dona, papel: "owner" }), null);
assert.equal(perfilDaSessao(cliente, { id: cliente, papel: "owner" })?.papel, "owner");
assert.equal(administra(perfilDaSessao(cliente, { id: cliente, papel: "cliente" })?.papel), false);
assert.equal(perfilDaSessao(cliente, { id: cliente, papel: "proprietaria" }), null);
assert.equal(perfilDaSessao("", { id: cliente, papel: "admin" }), null);

const sessao = ler("js/sessao.js");
assert.match(sessao, /signOut\(\{ scope: "global" \}\)/);
assert.match(sessao, /chave === "email-conta"/);
assert.doesNotMatch(sessao, /scope: "local"/);
assert.match(sessao, /storage: window\.sessionStorage/);
assert.doesNotMatch(sessao, /localStorage/);

const admin = ler("js/conta/admin.js");
assert.ok(admin.indexOf("app?.remove()") < admin.indexOf("loja.painel()"));
assert.match(admin, /classList\.add\("liberado"\)/);
assert.match(ler("css/painel.css"), /#painel-app:not\(\.liberado\)/);

function arquivosJs(diretorio, acumulo = []) {
  for (const nome of readdirSync(diretorio)) {
    const caminho = join(diretorio, nome);
    if (nome === "vendor" || nome === "node_modules" || nome === "supabase-config.exemplo.js") continue;
    if (statSync(caminho).isDirectory()) arquivosJs(caminho, acumulo);
    else if (nome.endsWith(".js")) acumulo.push(caminho);
  }
  return acumulo;
}

const fontes = arquivosJs(new URL("js/", raiz).pathname);
assert.ok(fontes.length > 5);
for (const arquivo of fontes) {
  const texto = readFileSync(arquivo, "utf8");
  assert.equal(/service_role|sb_secret|ASAAS_API_KEY/.test(texto), false, arquivo);
}

const webhook = ler("supabase/functions/webhook-asaas/index.ts");
assert.match(webhook, /segredosIguais/);
assert.match(ler("supabase/functions/_shared/regras.mjs"), /PAYMENT_RECEIVED/);
assert.match(ler("supabase/migracao-permissoes.sql"), /autor = alvo/);

console.log("ok isolamento de sessão");
