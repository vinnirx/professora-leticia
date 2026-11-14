import assert from "node:assert/strict";
import { decidirEvento, documentoValido, segredosIguais } from "../supabase/functions/_shared/regras.mjs";

function cpfDeTeste() {
  const base = "529982247";
  const pesos1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  const digito = (texto, pesos) => {
    const soma = texto.split("").reduce((total, item, indice) => total + Number(item) * pesos[indice], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const primeiro = digito(base, pesos1);
  const segundo = digito(`${base}${primeiro}`, pesos2);
  return `${base}${primeiro}${segundo}`;
}

assert.equal(documentoValido(cpfDeTeste()), true);
assert.equal(documentoValido("111.111.111-11"), false);
assert.equal(documentoValido("123"), false);

assert.equal(segredosIguais("token-sandbox", "token-sandbox"), true);
assert.equal(segredosIguais("token-sandbox", "outro-token"), false);
assert.equal(segredosIguais("", "token-sandbox"), false);
assert.equal(segredosIguais("curto", "token-sandbox"), false);

const recebido = decidirEvento({
  status: "pendente",
  tipo: "PAYMENT_RECEIVED",
  valorEsperado: 9.9,
  valorRecebido: 9.9,
});
assert.equal(recebido.liberar, true);
assert.equal(recebido.confirmacao, "asaas");

const confirmado = decidirEvento({
  status: "pendente",
  tipo: "PAYMENT_CONFIRMED",
  valorEsperado: 9.9,
  valorRecebido: 9.9,
});
assert.equal(confirmado.liberar, false);
assert.equal(confirmado.resultado, "confirmado_sem_liberar");
assert.equal(confirmado.status, "pendente");

const divergente = decidirEvento({
  status: "pendente",
  tipo: "PAYMENT_RECEIVED",
  valorEsperado: 9.9,
  valorRecebido: 4.9,
});
assert.equal(divergente.liberar, false);
assert.equal(divergente.status, "analise");

const repetido = decidirEvento({
  status: "pago",
  tipo: "PAYMENT_RECEIVED",
  valorEsperado: 9.9,
  valorRecebido: 9.9,
});
assert.equal(repetido.liberar, false);
assert.equal(repetido.resultado, "repetido");

const expirada = decidirEvento({
  status: "pendente",
  tipo: "PAYMENT_OVERDUE",
  valorEsperado: 9.9,
  valorRecebido: 9.9,
});
assert.equal(expirada.status, "expirada");
assert.equal(expirada.liberar, false);

const parcial = decidirEvento({
  status: "pago",
  tipo: "PAYMENT_PARTIALLY_REFUNDED",
  valorEsperado: 9.9,
  valorRecebido: 9.9,
});
assert.equal(parcial.liberar, false);
assert.equal(parcial.status, "analise");

const estorno = decidirEvento({
  status: "pago",
  tipo: "PAYMENT_REFUNDED",
  valorEsperado: 9.9,
  valorRecebido: 9.9,
});
assert.equal(estorno.status, "estornada");
assert.equal(estorno.liberar, false);

const foraDeOrdem = decidirEvento({
  status: "estornada",
  tipo: "PAYMENT_RECEIVED",
  valorEsperado: 9.9,
  valorRecebido: 9.9,
});
assert.equal(foraDeOrdem.liberar, false);
assert.equal(foraDeOrdem.status, "analise");

const criada = decidirEvento({
  status: "criada",
  tipo: "PAYMENT_CREATED",
  valorEsperado: 9.9,
  valorRecebido: null,
});
assert.equal(criada.status, "pendente");
assert.equal(criada.liberar, false);

console.log("ok regras de pagamento simuladas");
