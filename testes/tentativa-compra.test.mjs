import assert from "node:assert/strict";
import { situacaoAsaas } from "../supabase/functions/_shared/regras.mjs";
import { cobrancaReutilizavel, gravarTentativa, lerTentativa, limparTentativa, pedidoRepetido } from "../js/tentativa-compra.js";

const memoria = new Map();
const storage = {
  getItem: (chave) => memoria.get(chave) || null,
  setItem: (chave, valor) => memoria.set(chave, valor),
  removeItem: (chave) => memoria.delete(chave),
};

gravarTentativa(storage, ["celulas", "silabas"], "pedido-teste-01");
assert.equal(lerTentativa(storage, ["silabas", "celulas"])?.codigo, "pedido-teste-01");
assert.equal(lerTentativa(storage, ["adicao"]) , null);
assert.equal(storage.getItem("tentativa-compra").includes("valor"), false);
limparTentativa(storage);
assert.equal(lerTentativa(storage, ["celulas"]), null);

assert.equal(cobrancaReutilizavel({ status: "pendente", expiraEm: "2999-01-01T00:00:00.000Z" }), true);
assert.equal(cobrancaReutilizavel({ status: "pendente", expiraEm: "2000-01-01T00:00:00.000Z" }), false);
assert.equal(cobrancaReutilizavel({ status: "expirada", expiraEm: "" }), false);
assert.equal(cobrancaReutilizavel({ status: "cancelada", expiraEm: "" }), false);
assert.equal(cobrancaReutilizavel({ status: "pago", expiraEm: "" }), false);
assert.equal(pedidoRepetido({ code: "23505" }), true);
assert.equal(pedidoRepetido({ message: "outra falha" }), false);

const pago = situacaoAsaas({ statusCobranca: "pendente", statusGateway: "RECEIVED", valorEsperado: 4.9, valorGateway: 4.9 });
assert.equal(pago.liberar, true);
const confirmado = situacaoAsaas({ statusCobranca: "pendente", statusGateway: "CONFIRMED", valorEsperado: 4.9, valorGateway: 4.9 });
assert.equal(confirmado.liberar, false);
const divergente = situacaoAsaas({ statusCobranca: "pendente", statusGateway: "RECEIVED", valorEsperado: 4.9, valorGateway: 9.9 });
assert.equal(divergente.liberar, false);
const repetido = situacaoAsaas({ statusCobranca: "pago", statusGateway: "RECEIVED", valorEsperado: 4.9, valorGateway: 4.9 });
assert.equal(repetido.liberar, false);

console.log("tentativa-compra ok");
