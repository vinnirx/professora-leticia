import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agruparPorCodigo, apresentacao, deveConsultar, intervaloDaTela, podeCancelar, podeOcultar, prioridadeDaAcao } from "../js/conta/retomada.js";

assert.equal(apresentacao("continuar").botao, "Continuar pagamento");
assert.equal(apresentacao("tentar").botao, "Tentar gerar Pix novamente");
assert.equal(apresentacao("tentar").titulo, "Pix não gerado");
assert.equal(apresentacao("abaixo").botao, "");
assert.equal(apresentacao("manual").titulo, "Pix manual");
assert.equal(apresentacao("baixar").botao, "Baixar atividade");
assert.equal(apresentacao("vencido").titulo, "Pix vencido");
assert.equal(apresentacao("analise").botao, "");
assert.equal(apresentacao("manual").botao, "");
assert.equal(deveConsultar("continuar"), true);
assert.equal(deveConsultar("continuar", true), false);
assert.equal(deveConsultar("baixar"), false);
assert.equal(deveConsultar("analise"), false);
assert.equal(intervaloDaTela("tentar"), 0);
assert.equal(intervaloDaTela("continuar"), 15000);
assert.equal(intervaloDaTela("continuar", true), 0);
assert.equal(intervaloDaTela("estornado"), 0);
assert.equal(apresentacao("abaixo").titulo, "Pix não gerado");
assert.equal(apresentacao("abaixo").botao, "");
assert.equal(apresentacao("tentativa").titulo, "Pedido cancelado");
assert.equal(podeCancelar("abaixo"), true);
assert.equal(podeCancelar("continuar"), false);
assert.equal(podeCancelar("manual"), false);
assert.equal(podeCancelar("baixar"), false);
assert.equal(podeOcultar("abaixo"), true);
assert.equal(podeOcultar("confirmar"), false);
assert.equal(prioridadeDaAcao("baixar") < prioridadeDaAcao("continuar"), true);
assert.equal(prioridadeDaAcao("continuar") < prioridadeDaAcao("abaixo"), true);

const grupos = agruparPorCodigo([
  { txid: "pago123456", atividade_id: "celulas", titulo: "Células", valor: 4.9, status: "pago", criado_em: "2026-11-15T00:00:00Z" },
  { txid: "par9801234", atividade_id: "celulas", titulo: "Células", valor: 4.9, status: "aguardando", criado_em: "2026-11-16T00:00:00Z" },
  { txid: "par9801234", atividade_id: "silabas", titulo: "Sílabas", valor: 4.9, status: "aguardando", criado_em: "2026-11-16T00:00:01Z" },
  { txid: "58f9374f23", atividade_id: "celulas", titulo: "Células", valor: 4.9, status: "aguardando", criado_em: "2026-11-16T00:13:00Z", oculto_em: "2026-11-16T01:00:00Z" },
]);
assert.equal(grupos[0].txid, "pago123456");
assert.equal(grupos.find((item) => item.txid === "par9801234").valor, 9.8);
assert.equal(grupos.find((item) => item.txid === "par9801234").atividades.length, 2);
assert.equal(grupos.find((item) => item.txid === "58f9374f23").oculto, true);

const tela = readFileSync(new URL("../js/conta/minhas.js", import.meta.url), "utf8");
assert.equal(tela.includes('botaoDaConta(pedido, "continuar")'), false);
assert.equal(tela.includes("Pagamento pendente"), false);
assert.match(tela, /Confirmar cancelamento/);
assert.match(tela, /Ocultar do meu histórico/);

console.log("ok retomada");
