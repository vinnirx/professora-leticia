import assert from "node:assert/strict";
import { apresentacao, deveConsultar, intervaloDaTela } from "../js/conta/retomada.js";

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

console.log("ok retomada");
