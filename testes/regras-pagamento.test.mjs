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
  diagnosticoAsaas,
  decidirCliente,
  decidirConsultaCobranca,
  decidirPosCriacao,
  decidirRetomada,
  intervaloDaConsulta,
  cobrancaCompativel,
  mensagemParaCliente,
  valorAceitoAsaas,
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

const aceita = decidirPosCriacao({
  criacao: { id: "pay_aceita", status: 200, ok: true, jsonValido: true },
  consulta: null,
});
assert.equal(aceita.acao, "gravar");
assert.equal(aceita.apagar, false);
const recusada = decidirPosCriacao({
  criacao: { id: "", status: 400, ok: false, jsonValido: true },
  consulta: { id: "", status: 200, ok: true, jsonValido: true },
});
assert.equal(recusada.acao, "preservar");
assert.equal(recusada.apagar, false);
assert.match(recusada.mensagem, /não pague de novo ainda/i);
const timeoutRemoto = decidirPosCriacao({
  criacao: { id: "", status: 504, ok: false, jsonValido: false },
  consulta: { id: "pay_recuperada", status: 200, ok: true, jsonValido: true },
});
assert.equal(timeoutRemoto.acao, "gravar");
assert.equal(timeoutRemoto.id, "pay_recuperada");
const respostaInvalida = decidirPosCriacao({
  criacao: { id: "", status: 200, ok: true, jsonValido: false },
  consulta: { id: "", status: 200, ok: true, jsonValido: true },
});
assert.equal(respostaInvalida.acao, "preservar");
assert.match(respostaInvalida.mensagem, /já existe/i);
const repeticao = decidirConsultaCobranca({ id: "pay_antiga", status: 200, ok: true, jsonValido: true });
assert.equal(repeticao.acao, "reconciliar");
assert.equal(decidirConsultaCobranca({ id: "", status: 200, ok: true, jsonValido: true }).acao, "criar");
assert.equal(decidirConsultaCobranca({ id: "", status: 500, ok: false, jsonValido: true }).acao, "aguardar");
assert.equal(decidirCliente({ id: "cus_pronto", status: 200, ok: true, jsonValido: true }).acao, "reutilizar");
assert.equal(decidirCliente({ id: "", status: 200, ok: true, jsonValido: true }).acao, "criar");
assert.equal(decidirCliente({ id: "", status: 504, ok: false, jsonValido: false }).acao, "aguardar");
const diag = diagnosticoAsaas({
  etapa: "criar_cobranca",
  status: 400,
  jsonValido: true,
  correlacao: "txid-diagnostico",
  json: { errors: [{ code: "invalid_object", description: "Cobrança recusada para cliente@example.com CPF 12345678901." }] },
});
assert.equal(diag.status, 400);
assert.deepEqual(diag.codigos, ["invalid_object"]);
assert.equal(diag.descricao.includes("@"), false);
assert.equal(diag.descricao.includes("12345678901"), false);
assert.equal(diag.correlacao, "txid-diagnostico");
assert.equal(JSON.stringify(diag).includes("access_token"), false);

const recusaValor = diagnosticoAsaas({
  etapa: "criar_cobranca",
  status: 400,
  jsonValido: true,
  correlacao: "58f9374f23",
  json: { errors: [{ code: "invalid_object", description: "O valor da cobrança não pode ser menor que o mínimo." }] },
});
assert.match(mensagemParaCliente(recusaValor), /Nenhuma cobrança foi criada/);
assert.equal(mensagemParaCliente(diag), "");

const agora = Date.parse("2026-11-16T00:00:00Z");
assert.equal(decidirRetomada({ encontrada: false }).acao, "negar");
assert.equal(decidirRetomada({
  encontrada: true, statusPedido: "aguardando", statusCobranca: "pendente", temPix: true, temExterna: true, expiraEm: "2026-11-17T00:00:00Z", agora,
}).acao, "continuar");
assert.equal(valorAceitoAsaas(4.9), false);
assert.equal(valorAceitoAsaas(5), true);
assert.equal(valorAceitoAsaas(9.8), true);
assert.equal(decidirRetomada({
  encontrada: true, statusPedido: "aguardando", statusCobranca: "criada", temPix: false, temExterna: false, ausenciaConfirmada: true, valor: 4.9, agora,
}).acao, "abaixo");
assert.equal(decidirRetomada({
  encontrada: true, statusPedido: "aguardando", statusCobranca: "criada", temPix: false, temExterna: false, ausenciaConfirmada: true, valor: 9.8, agora,
}).acao, "tentar");
assert.equal(decidirRetomada({
  encontrada: true, statusPedido: "aguardando", statusCobranca: "criada", temPix: false, temExterna: false, ausenciaConfirmada: false, valor: 9.8, agora,
}).acao, "aguardar");
assert.equal(decidirRetomada({
  encontrada: true, statusPedido: "aguardando", statusCobranca: "", temPix: false, temExterna: false, agora,
}).acao, "manual");
assert.equal(decidirRetomada({
  encontrada: true, statusPedido: "pago", statusCobranca: "pago", direito: false, agora,
}).acao, "confirmar");
assert.equal(decidirRetomada({
  encontrada: true, statusPedido: "pago", statusCobranca: "pago", direito: true, agora,
}).acao, "baixar");
assert.equal(decidirEvento({ status: "pendente", tipo: "PAYMENT_CONFIRMED", valorEsperado: 4.9, valorRecebido: 4.9 }).liberar, false);
assert.equal(decidirRetomada({
  encontrada: true, statusPedido: "aguardando", statusCobranca: "pendente", temPix: true, expiraEm: "2026-11-15T00:00:00Z", agora,
}).acao, "vencido");
assert.equal(decidirRetomada({
  encontrada: true, statusPedido: "aguardando", statusCobranca: "expirada", temPix: true, agora,
}).renovavel, true);
assert.equal(decidirRetomada({
  encontrada: true, statusPedido: "estornado", statusCobranca: "estornada", agora,
}).acao, "estornado");
assert.equal(decidirRetomada({
  encontrada: true, statusPedido: "aguardando", statusCobranca: "analise", agora,
}).acao, "analise");
assert.equal(intervaloDaConsulta("continuar"), 15000);
assert.equal(intervaloDaConsulta("tentar"), 0);
assert.equal(intervaloDaConsulta("abaixo"), 0);
assert.equal(intervaloDaConsulta("baixar"), 0);
assert.equal(intervaloDaConsulta("analise"), 0);

const abertas = [
  { txid: "antiga", status: "criada", criadoEm: "2026-11-16T00:13:38Z", chave: "chave-antiga", atividades: ["celulas"] },
  { txid: "recente", status: "criada", criadoEm: "2026-11-16T00:16:17Z", chave: "chave-recente", atividades: ["celulas"] },
  { txid: "par", status: "pendente", criadoEm: "2026-11-16T00:20:00Z", chave: "chave-par", atividades: ["celulas", "silabas"] },
];
assert.equal(cobrancaCompativel(abertas, ["celulas"]).chave, "chave-recente");
assert.equal(cobrancaCompativel(abertas, ["silabas", "celulas"]).chave, "chave-par");
assert.equal(cobrancaCompativel(abertas, ["adicao"]), null);
assert.equal(cobrancaCompativel([{ status: "pago", atividades: ["celulas"], chave: "paga" }], ["celulas"]), null);

console.log("ok regras de pagamento simuladas");
