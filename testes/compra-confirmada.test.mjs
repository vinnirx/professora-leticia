import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { acoesDaCompraPaga, DESTINO_MATERIAIS, mensagemDoDownload, TEXTO_COMPRA_APROVADA } from "../js/checkout.js";
import { destinoInterno } from "../js/rotas.js";
import { pedidoDeEntrada } from "../js/conta/apresentacao.js";

const checkout = readFileSync(new URL("../js/checkout.js", import.meta.url), "utf8");
const sessao = readFileSync(new URL("../js/sessao.js", import.meta.url), "utf8");
const download = readFileSync(new URL("../supabase/functions/link-download/index.ts", import.meta.url), "utf8");
const conta = readFileSync(new URL("../js/conta/minhas.js", import.meta.url), "utf8");
const paginaConta = readFileSync(new URL("../minha-conta/index.html", import.meta.url), "utf8");

assert.equal(TEXTO_COMPRA_APROVADA, "Sua compra foi aprovada. Seu material já está disponível para download.");
assert.equal(DESTINO_MATERIAIS, "minha-conta/#materiais");

const aguardando = acoesDaCompraPaga([]);
assert.equal(aguardando.baixar, "");
assert.equal(aguardando.principal, "materiais");

const unico = acoesDaCompraPaga([{ atividade_id: "pareamento-de-vogais", titulo: "Pareamento de Vogais" }]);
assert.equal(unico.principal, "baixar");
assert.equal(unico.baixar, "pareamento-de-vogais");

const varios = acoesDaCompraPaga([
  { id: "pareamento-de-vogais" },
  { id: "adicao" },
]);
assert.equal(varios.principal, "materiais");
assert.equal(varios.baixar, "");
assert.equal(acoesDaCompraPaga([{ id: "adicao" }, { id: "adicao" }]).principal, "baixar");
assert.equal(acoesDaCompraPaga([{ id: "../secreto" }, { id: "adicao" }]).baixar, "adicao");

assert.match(mensagemDoDownload("negado"), /ainda não está liberado/);
assert.match(mensagemDoDownload("entrar"), /Entre de novo/);
assert.match(mensagemDoDownload("tentar"), /Não foi possível preparar o download/);
assert.match(mensagemDoDownload("arquivo"), /Não foi possível baixar agora/);

assert.match(checkout, /situacao === "pago"\) mostrarCompraPaga/);
assert.match(checkout, /automatica\.status === "pago"/);
assert.match(checkout, /loja\.materiaisPagos\(txid\)/);
assert.match(checkout, /loja\.baixar\(id\)/);
assert.match(checkout, /Baixar minha atividade/);
assert.match(checkout, /Ver meus materiais/);
assert.match(checkout, /Preparando o download/);
assert.match(checkout, /pedido\.hidden = true/);
assert.match(checkout, /resultado\.hidden = true/);
assert.match(checkout, /dataset\.baixando === "1"/);
assert.doesNotMatch(checkout, /createSignedUrl|signedUrl|direitos_acesso|storage\.from|pode_baixar/);

assert.match(sessao, /async materiaisPagos\(txid\)/);
assert.match(sessao, /\.eq\("status", "pago"\)/);
assert.match(sessao, /\.eq\("usuario_id", atual\.user\.id\)/);
assert.match(sessao, /resposta\.status === 403\) throw new Error\("negado"\)/);
assert.doesNotMatch(sessao.slice(sessao.indexOf("async materiaisPagos")), /insert\(|direitos_acesso/);

assert.match(download, /pode_baixar/);
assert.match(download, /permitido !== true/);
assert.match(download, /createSignedUrl/);
assert.match(download, /120/);
assert.doesNotMatch(download, /insert\(|direitos_acesso/);

assert.equal(destinoInterno("minha-conta/#materiais", "/"), "minha-conta/#materiais");
assert.equal(destinoInterno("minha-conta/#materiais", "/entrar/"), "../minha-conta/#materiais");
assert.equal(pedidoDeEntrada({ papel: "cliente" }, DESTINO_MATERIAIS), DESTINO_MATERIAIS);
assert.equal(destinoInterno(pedidoDeEntrada({ papel: "cliente" }, DESTINO_MATERIAIS), "/entrar/"), "../minha-conta/#materiais");
assert.match(conta, /location\.hash !== "#materiais"/);
assert.match(conta, /depois=\$\{encodeURIComponent\("minha-conta\/#materiais"\)\}/);
assert.match(paginaConta, /id="materiais"/);
assert.match(paginaConta, /conta\.js\?v=78/);

console.log("ok compra confirmada");
