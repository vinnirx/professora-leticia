import assert from "node:assert/strict";
import {
  decidirEvento,
  acessoCobranca,
  destinoAsaas,
  identificadorAutenticado,
  planoConciliacao,
  documentoValido,
  eventoAceito,
  eventoDeConsulta,
  respostaDoWebhook,
  segredosIguais,
} from "../supabase/functions/_shared/regras.mjs";

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

assert.equal(eventoAceito({ id: "evt_1", event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } }), true);
assert.equal(eventoAceito({ id: "abc", event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } }), false);
assert.equal(eventoAceito({ id: "evt_1", event: "", payment: { id: "pay_1" } }), false);
assert.equal(respostaDoWebhook({ erroPersistencia: true }).status, 500);
assert.equal(respostaDoWebhook({ repetir: true }).status, 409);
const recebidoHttp = respostaDoWebhook({ processar: true });
assert.equal(recebidoHttp.status, 200);
assert.equal(recebidoHttp.corpo.resultado, "recebido");
const falhaHttp = respostaDoWebhook({ processar: true, erroProcessamento: true });
assert.equal(falhaHttp.status, 200);
assert.equal(falhaHttp.corpo.reprocessar, true);
assert.equal(eventoDeConsulta("RECEIVED"), "PAYMENT_RECEIVED");
assert.equal(eventoDeConsulta("CONFIRMED"), "PAYMENT_CONFIRMED");
assert.equal(eventoDeConsulta("PENDING"), "");
const sandbox = destinoAsaas({
  ambiente: "sandbox",
  chave: "$aact_hmlg_teste",
});
assert.equal(sandbox.base, "https://api-sandbox.asaas.com/v3");
assert.equal(destinoAsaas({ ambiente: "sandbox", chave: "$aact_prod_teste" }).ok, false);
assert.equal(destinoAsaas({ ambiente: "producao", producaoLiberada: "sim", chave: "$aact_hmlg_teste" }).ok, false);
assert.equal(destinoAsaas({
  ambiente: "sandbox",
  baseInformada: "http://127.0.0.1:8799/v3",
  chave: "homologacao-local",
}).base, "http://127.0.0.1:8799/v3");
assert.equal(destinoAsaas({
  ambiente: "sandbox",
  baseInformada: "https://api.asaas.com/v3",
  chave: "homologacao-local",
}).ok, false);
assert.equal(destinoAsaas({ ambiente: "producao", leitura: true, chave: "$aact_prod_teste" }).base, "https://api.asaas.com/v3");
assert.equal(destinoAsaas({ ambiente: "producao", testeLiberado: "sim", chave: "$aact_prod_teste" }).ok, true);
assert.equal(destinoAsaas({ ambiente: "producao", testeLiberado: "sim", chave: "$aact_hmlg_teste" }).ok, false);
assert.equal(destinoAsaas({ ambiente: "producao", chave: "$aact_prod_teste" }).ok, false);

const conta = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const sessao = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const outraSessao = "cccccccc-cccc-cccc-cccc-cccccccccccc";
assert.equal(identificadorAutenticado({ usuarioId: conta, subject: conta, sessionId: sessao }), conta);
assert.equal(identificadorAutenticado({ usuarioId: conta, subject: conta, sessionId: outraSessao }), conta);
assert.equal(identificadorAutenticado({ usuarioId: sessao, subject: sessao, sessionId: sessao }), "");
assert.equal(identificadorAutenticado({ usuarioId: conta, subject: sessao, sessionId: sessao }), "");
assert.equal(acessoCobranca({
  ambiente: "producao",
  usuarioId: identificadorAutenticado({ usuarioId: conta, subject: conta, sessionId: outraSessao }),
  emailConfirmado: true,
  contaTeste: conta,
  testeLiberado: "sim",
}), "teste");
assert.equal(acessoCobranca({
  ambiente: "producao",
  usuarioId: sessao,
  emailConfirmado: true,
  contaTeste: conta,
  testeLiberado: "sim",
}), "");
assert.equal(acessoCobranca({
  ambiente: "producao",
  usuarioId: conta,
  emailConfirmado: true,
  contaTeste: conta,
  testeLiberado: "sim",
}), "teste");
assert.equal(acessoCobranca({
  ambiente: "producao",
  usuarioId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  emailConfirmado: true,
  contaTeste: conta,
  testeLiberado: "sim",
}), "");
assert.equal(acessoCobranca({
  ambiente: "producao",
  usuarioId: conta,
  emailConfirmado: false,
  contaTeste: conta,
  testeLiberado: "sim",
}), "confirmar");
assert.equal(acessoCobranca({
  ambiente: "producao",
  usuarioId: conta,
  emailConfirmado: true,
  contaTeste: conta,
  testeLiberado: "nao",
  producaoLiberada: "sim",
}), "geral");
assert.equal(acessoCobranca({ ambiente: "sandbox", usuarioId: conta, emailConfirmado: true }), "sandbox");
const bloqueada = planoConciliacao({ destinoOk: false, resultados: [], cobrancasAbertas: 0 });
assert.equal(bloqueada.status, 200);
assert.equal(bloqueada.corpo.consulta, "bloqueada");
const pendente = planoConciliacao({ destinoOk: false, resultados: [], cobrancasAbertas: 1 });
assert.equal(pendente.status, 500);
const falha = planoConciliacao({ destinoOk: true, resultados: [{ resultado: "falhou" }], cobrancasAbertas: 0 });
assert.equal(falha.status, 500);
assert.equal(falha.corpo.alerta, true);

console.log("ok regras de pagamento simuladas");
