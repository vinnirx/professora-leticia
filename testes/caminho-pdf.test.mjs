import assert from "node:assert/strict";
import { caminhoPdf } from "../js/arquivo-seguro.js";

assert.equal(caminhoPdf("adicao", "situacoes-problema-adicao.pdf"), "adicao/situacoes-problema-adicao.pdf");
assert.equal(caminhoPdf("../adicao", "arquivo.pdf"), "");
assert.equal(caminhoPdf("adicao", "../arquivo.pdf"), "");
assert.equal(caminhoPdf("adicao", "pasta/arquivo.pdf"), "");
assert.equal(caminhoPdf("adicao", "arquivo.pdf?token=1"), "");
assert.equal(caminhoPdf("ADICAO", "arquivo.pdf"), "");

console.log("ok caminho de PDF");
