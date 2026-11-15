import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { documentoValido, mascararDocumento } from "../js/documento.js";
import { documentoValido as documentoServidor } from "../supabase/functions/_shared/regras.mjs";

function cpfDeTeste() {
  const base = "390533447";
  const pesos1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  const digito = (texto, pesos) => {
    const soma = texto.split("").reduce((total, item, indice) => total + Number(item) * pesos[indice], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const primeiro = digito(base, pesos1);
  return `${base}${primeiro}${digito(`${base}${primeiro}`, pesos2)}`;
}

function cnpjDeTeste() {
  const base = "123456780001";
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const digito = (texto, pesos) => {
    const soma = texto.split("").reduce((total, item, indice) => total + Number(item) * pesos[indice], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const primeiro = digito(base, pesos1);
  return `${base}${primeiro}${digito(`${base}${primeiro}`, pesos2)}`;
}

const cpf = cpfDeTeste();
const cnpj = cnpjDeTeste();
assert.equal(documentoValido(cpf), true);
assert.equal(documentoServidor(cpf), true);
assert.equal(documentoValido(`${cpf.slice(0, 10)}${(Number(cpf[10]) + 1) % 10}`), false);
assert.equal(documentoValido("111.111.111-11"), false);
assert.equal(documentoValido(cnpj), true);
assert.equal(documentoServidor(cnpj), true);
assert.equal(documentoValido(`${cnpj.slice(0, 13)}${(Number(cnpj[13]) + 1) % 10}`), false);
assert.equal(mascararDocumento(cpf), `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`);
assert.equal(mascararDocumento(cnpj), `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`);

const checkout = readFileSync(new URL("../js/checkout.js", import.meta.url), "utf8");
const cobranca = readFileSync(new URL("../supabase/functions/criar-cobranca/index.ts", import.meta.url), "utf8");
assert.doesNotMatch(checkout, /sessionStorage\.setItem\([^)]*documento/);
assert.equal(checkout.includes("localStorage"), false);
assert.match(cobranca, /value: preparo\.valor_bruto/);
assert.doesNotMatch(cobranca, /value: pedido/);
assert.doesNotMatch(cobranca, /console\.log/);
assert.match(cobranca, /externalReference: usuarioId/);
assert.match(cobranca, /cpfCnpj: documento/);

console.log("documento-mascara ok");
