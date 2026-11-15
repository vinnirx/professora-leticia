import assert from "node:assert/strict";
import { itemOficial, guardarNoCarrinho, lerCarrinho } from "../js/carrinho.js";
import { mesclarOferta, publicarOferta } from "../js/ofertas.js";
import { enderecoDeConfirmacao, MENSAGEM_CONFIRMACAO } from "../js/endereco-publico.js";

const memoria = new Map();
globalThis.sessionStorage = {
  getItem: (chave) => (memoria.has(chave) ? memoria.get(chave) : null),
  setItem: (chave, valor) => memoria.set(chave, String(valor)),
  removeItem: (chave) => memoria.delete(chave),
};
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
};
globalThis.window = {
  loja: {
    atividades: [{
      id: "material-ficticio",
      titulo: "Título antigo do arquivo local",
      preco: 9.9,
      resumo: "resumo local",
      inclui: ["PDF"],
    }],
  },
};

const mesclada = mesclarOferta(
  { id: "material-ficticio", titulo: "Título novo do banco", preco: 4.9, area: "", temas: [], capa: "", habilidades: [] },
  { id: "material-ficticio", titulo: "Título antigo do arquivo local", preco: 9.9, area: "Matemática", temas: ["Situações-Problema"], capa: "img/capa.png", habilidades: ["contar"] },
);
assert.equal(mesclada.titulo, "Título novo do banco");
assert.equal(mesclada.preco, 4.9);
assert.equal(mesclada.area, "Matemática");
assert.equal(mesclada.capa, "img/capa.png");

guardarNoCarrinho({ id: "material-ficticio", titulo: "Título antigo do arquivo local", preco: 9.9, resumo: "resumo local", inclui: ["PDF"] });
assert.equal(lerCarrinho()[0].titulo, "Título antigo do arquivo local");

publicarOferta(mesclada);
const atual = lerCarrinho()[0];
assert.equal(atual.titulo, "Título novo do banco");
assert.equal(atual.preco, 4.9);
assert.equal(atual.id, "material-ficticio");
assert.deepEqual(itemOficial({ id: "material-ficticio", titulo: "qualquer", preco: 1 }).titulo, "Título novo do banco");

assert.equal(enderecoDeConfirmacao("https://inclusaonocotidiano.com.br/criar-conta/"), "https://inclusaonocotidiano.com.br/entrar/");
assert.equal(enderecoDeConfirmacao("https://vinnirx.github.io/professora-leticia/criar-conta/"), "https://vinnirx.github.io/professora-leticia/entrar/");
assert.match(MENSAGEM_CONFIRMACAO, /caixa de entrada e também o spam/);

console.log("carrinho-ofertas ok");
