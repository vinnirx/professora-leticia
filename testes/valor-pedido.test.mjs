import assert from "node:assert/strict";
import { totalConfirmado } from "../js/valor-pedido.js";

const um = totalConfirmado(
  ["material-ficticio"],
  [{ atividade_id: "material-ficticio", titulo: "Título novo do banco", valor: "4.90" }],
);
assert.equal(um.total, 4.9);
assert.deepEqual(um.titulos, ["Título novo do banco"]);

const varios = totalConfirmado(
  ["material-ficticio", "atividade-vizinha"],
  [
    { atividade_id: "atividade-vizinha", titulo: "Vizinha", valor: 4.9 },
    { atividade_id: "material-ficticio", titulo: "Principal", valor: 9.9 },
  ],
);
assert.equal(varios.total, 14.8);
assert.deepEqual(varios.titulos, ["Principal", "Vizinha"]);

assert.equal(totalConfirmado(["material-ficticio"], []), null);
assert.equal(totalConfirmado(
  ["material-ficticio"],
  [{ atividade_id: "material-ficticio", titulo: "Antigo", valor: 9.9 }, { atividade_id: "outra", titulo: "Extra", valor: 1 }],
), null);
assert.equal(totalConfirmado(
  ["material-ficticio", "atividade-vizinha"],
  [{ atividade_id: "material-ficticio", titulo: "Só uma", valor: 9.9 }],
), null);

console.log("valor-pedido ok");
