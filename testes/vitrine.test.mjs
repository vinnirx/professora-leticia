import assert from "node:assert/strict";
import { montarVitrine, podeVoltarALoja, semVenda } from "../js/vitrine.js";

const local = [{ id: "adicao", titulo: "Local", arquivada_em: null }];
const remota = { id: "adicao", titulo: "Servidor", arquivada_em: null };
const arquivada = { id: "adicao", titulo: "Servidor", arquivada_em: "2026-11-15T12:00:00Z" };
const nova = { id: "nova", titulo: "Só no servidor", arquivada_em: null };

assert.deepEqual(montarVitrine(local, [], false).map((item) => item.id), ["adicao"]);
assert.deepEqual(montarVitrine(local, [remota, nova], false).map((item) => item.id), ["adicao", "nova"]);
assert.deepEqual(montarVitrine(local, [arquivada], true).map((item) => item.id), []);
assert.deepEqual(montarVitrine(local, [remota, arquivada], true).map((item) => item.id), ["adicao"]);
assert.equal(podeVoltarALoja({ arquivo: "a.pdf", preco: 4.9 }), "");
assert.match(podeVoltarALoja({ arquivo: "", preco: 4.9 }), /PDF/);
assert.match(podeVoltarALoja({ arquivo: "a.pdf", preco: 0 }), /preço/);
assert.equal(semVenda([{ atividade_id: "outra" }], "adicao"), true);
assert.equal(semVenda([{ atividade_id: "adicao" }], "adicao"), false);

console.log("ok vitrine");
