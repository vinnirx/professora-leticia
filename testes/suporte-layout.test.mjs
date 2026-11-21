import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resumoDoChamado } from "../js/conta/cartao-suporte.js";

const admin = readFileSync(new URL("../js/conta/admin.js", import.meta.url), "utf8");
const painel = readFileSync(new URL("../gerenciar/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../css/painel.css", import.meta.url), "utf8");
const conta = readFileSync(new URL("../js/conta.js", import.meta.url), "utf8");

const chamado = {
  id: "abc-def",
  usuario_id: "cliente",
  assunto: "download",
  status: "aberto",
  criado_em: "2026-11-01T15:00:00.000Z",
  nome: "Ana",
  email: "ana@example.com",
  mensagens: [
    { autor_id: "equipe", texto: "Resposta da equipe", criado_em: "2026-11-02T15:00:00.000Z" },
    { autor_id: "cliente", texto: "Primeira mensagem ".repeat(30), criado_em: "2026-11-01T18:00:00.000Z" },
  ],
};

const semPedido = resumoDoChamado(chamado, "—");
assert.equal(semPedido.assunto, "Download");
assert.equal(semPedido.situacao, "Aberto");
assert.equal(semPedido.pedido, "");
assert.equal(semPedido.valor, "");
assert.equal(semPedido.nome, "Ana");
assert.equal(semPedido.autorPrevia, "Equipe");
assert.equal(semPedido.previa, "Resposta da equipe");
assert.equal(semPedido.mensagens[0].autor, "Cliente");
assert.equal(semPedido.mensagens[1].autor, "Equipe");
assert.ok(semPedido.mensagens[0].texto.startsWith("Primeira mensagem"));

const comPedido = resumoDoChamado({ ...chamado, txid: "PEDIDO1", status: "resolvido" }, "R$ 9,80");
assert.equal(comPedido.pedido, "PEDIDO1");
assert.equal(comPedido.valor, "R$ 9,80");
assert.equal(comPedido.situacao, "Resolvido");
assert.equal(comPedido.aguardando, false);

const vazio = resumoDoChamado({ assunto: "outro", status: "atendimento", mensagens: [] }, "");
assert.equal(vazio.nome, "");
assert.equal(vazio.email, "");
assert.equal(vazio.previa, "");
assert.equal(vazio.mensagens.length, 0);
assert.equal(vazio.situacao, "Em atendimento");

const suporte = painel.slice(painel.indexOf('data-painel="suporte"'), painel.indexOf('data-painel="equipe"'));
assert.match(suporte, /class="filtros-painel filtros-suporte"/);
assert.doesNotMatch(suporte, /campo-largo/);
assert.match(suporte, /id="suporte-historico"/);
assert.match(suporte, /id="suporte-resposta-fechar"/);
assert.doesNotMatch(suporte, /id="lista-suporte" class="tabela-rolagem"/);
assert.match(css, /\.filtros-painel\.filtros-suporte \{[^}]*grid-template-columns: minmax\(0, 65fr\) minmax\(0, 35fr\)/s);
assert.match(css, /@media \(max-width: 640px\) \{\s*\.filtros-painel\.filtros-suporte \{ grid-template-columns: 1fr; \}/);
assert.match(css, /\.cartao-suporte-previa p \{[^}]*-webkit-line-clamp: 3/s);
assert.match(css, /\.mensagem-suporte p \{[^}]*overflow-wrap: anywhere/s);
assert.match(admin, /criarCartaoSuporte/);
assert.match(admin, /preencherHistorico/);
assert.match(admin, /aoVer: \(item\) => mostrarResposta\(item, "conversa"\)/);
assert.match(admin, /aoResponder: \(item\) => mostrarResposta\(item, "resposta"\)/);
assert.doesNotMatch(admin.slice(admin.indexOf("function pintarSuporte"), admin.indexOf("async function mudarSuporte")), /montarTabela|historicoSolicitacao|Autorizar estorno/);
assert.match(conta, /admin\.js\?v=44/);
assert.match(painel, /painel\.css\?v=29/);
assert.match(painel, /conta\.js\?v=75/);

console.log("ok layout do suporte");
