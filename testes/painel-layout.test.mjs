import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { administra } from "../js/conta/papeis.js";

const painel = readFileSync(new URL("../gerenciar/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../css/painel.css", import.meta.url), "utf8");
const admin = readFileSync(new URL("../js/conta/admin.js", import.meta.url), "utf8");
const sessao = readFileSync(new URL("../js/sessao.js", import.meta.url), "utf8");

function filtros(html, classe) {
  const marca = `class="filtros-painel ${classe}"`;
  const inicio = html.indexOf(marca);
  const fim = html.indexOf("</div>", inicio);
  return html.slice(inicio, fim);
}

const atividades = filtros(painel, "filtros-quarta");
const pedidos = painel.slice(painel.lastIndexOf('class="filtros-painel filtros-quarta"'), painel.indexOf("</div>", painel.lastIndexOf('class="filtros-painel filtros-quarta"')));
const financeiro = filtros(painel, "filtros-financeiro");
assert.match(atividades, /filtros-quarta/);
assert.match(pedidos, /filtros-quarta/);
assert.match(financeiro, /filtros-financeiro/);
assert.equal((atividades.match(/<label>/g) || []).length, 4);
assert.equal((pedidos.match(/<label>/g) || []).length, 4);
assert.match(financeiro, /data-periodo="dia"/);
assert.match(financeiro, /data-periodo="mes"/);
assert.match(financeiro, /data-periodo="ano"/);
assert.match(financeiro, /id="financeiro-inicio"/);
assert.match(financeiro, /id="financeiro-fim"/);
assert.match(financeiro, /id="exportar-csv"/);

assert.match(css, /\.filtros-painel\.filtros-quarta \{[^}]*grid-template-columns: minmax\(0, 1\.45fr\) repeat\(3, minmax\(0, 1fr\)\)/s);
assert.match(css, /@media \(max-width: 1099px\)/);
assert.match(css, /@media \(max-width: 640px\)/);
assert.match(css, /\.tabela-rolagem \{[^}]*overflow-x: auto/s);
assert.match(css, /\.tabela-larga \{ min-width: 75\.5rem; \}/);
assert.match(css, /\.tabela-atividades \{ min-width: 68rem; \}/);
assert.match(css, /\.tabela-atividades \.acoes \{[^}]*flex-wrap: nowrap/s);
assert.match(css, /\.qr-fator \{[^}]*border-radius: 0/s);
assert.match(css, /\.tabela-larga td:not\(\.celula-acoes\) \{ overflow: hidden; \}/);
assert.match(css, /\.tabela-admin \.botao \{[^}]*min-height: var\(--adm-altura\)/s);
assert.match(css, /\.tabela-admin \.botao-icone \{ width: var\(--adm-altura\); \}/);
assert.match(css, /\.menu-painel button \{[^}]*min-height: var\(--adm-altura\)/s);
assert.match(css, /\.pessoa strong \{[^}]*overflow-wrap: anywhere/s);
assert.match(css, /\.materiais-lista span/);
assert.match(css, /#painel-app:not\(\.liberado\)/);

assert.match(admin, /listaMateriais\(grupo\)/);
assert.match(admin, /className = "materiais-lista"/);
assert.match(admin, /className = "email-quebra"/);
assert.match(admin, /fecharCaixa/);
assert.match(admin, /linhaExportada/);
assert.match(admin, /"tabela-larga"/);
assert.match(admin, /\["7\.2rem", "9\.4rem", "13rem", "14rem"/);
assert.doesNotMatch(admin, /"16%", "20%"/);
assert.doesNotMatch(admin, /indisponivel\(\),\s*indisponivel\(\)/);
const remove = admin.indexOf("app?.remove()");
const carga = admin.indexOf("loja.painel()");
assert.ok(remove > 0 && remove < carga);
assert.match(admin, /classList\.add\("liberado"\)/);
assert.match(sessao, /perfilDaSessao/);
assert.match(sessao, /status, confirmacao, criado_em/);

assert.equal(administra("cliente"), false);
assert.equal(administra("admin"), true);
assert.equal(administra("owner"), true);
assert.equal(administra("super_admin"), true);

console.log("ok layout do painel");
