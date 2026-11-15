function verificador(base, pesos) {
  const soma = base.split("").reduce((total, digito, indice) => total + Number(digito) * pesos[indice], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function documentoValido(valor) {
  const digitos = String(valor || "").replace(/\D/g, "");
  if (/^(\d)\1+$/.test(digitos)) return false;
  if (digitos.length === 11) {
    const primeiro = verificador(digitos.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const segundo = verificador(digitos.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return digitos === `${digitos.slice(0, 9)}${primeiro}${segundo}`;
  }
  if (digitos.length === 14) {
    const primeiro = verificador(digitos.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const segundo = verificador(digitos.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return digitos === `${digitos.slice(0, 12)}${primeiro}${segundo}`;
  }
  return false;
}

function enderecoLocal(valor) {
  try {
    const alvo = new URL(String(valor || ""));
    return alvo.protocol === "http:" && (alvo.hostname === "127.0.0.1" || alvo.hostname === "localhost");
  } catch {
    return false;
  }
}

export function destinoAsaas({ ambiente, producaoLiberada, testeLiberado, leitura, baseInformada, chave }) {
  const segredo = String(chave || "");
  if (!segredo) return { ok: false, base: "" };
  if (String(ambiente) === "sandbox" && enderecoLocal(baseInformada)) {
    if (segredo.includes("_prod_")) return { ok: false, base: "" };
    return { ok: true, base: String(baseInformada).replace(/\/$/, "") };
  }
  if (String(ambiente) === "sandbox") {
    if (!segredo.includes("_hmlg_")) return { ok: false, base: "" };
    return { ok: true, base: "https://api-sandbox.asaas.com/v3" };
  }
  if (String(ambiente) !== "producao" || !segredo.includes("_prod_")) return { ok: false, base: "" };
  if (leitura === true || String(producaoLiberada) === "sim" || String(testeLiberado) === "sim") {
    return { ok: true, base: "https://api.asaas.com/v3" };
  }
  return { ok: false, base: "" };
}

export function identificadorAutenticado({ usuarioId, subject, sessionId }) {
  const conta = String(usuarioId || "").trim().toLowerCase();
  const sujeito = String(subject || "").trim().toLowerCase();
  const sessao = String(sessionId || "").trim().toLowerCase();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (!uuid.test(conta) || conta !== sujeito || !uuid.test(sessao) || conta === sessao) return "";
  return conta;
}

export function acessoCobranca({ ambiente, usuarioId, emailConfirmado, contaTeste, testeLiberado, producaoLiberada }) {
  const producao = String(ambiente) === "producao";
  const geral = producao && String(producaoLiberada) === "sim";
  const mesmaConta = segredosIguais(
    String(usuarioId || "").trim().toLowerCase(),
    String(contaTeste || "").trim().toLowerCase(),
  );
  const teste = producao && String(testeLiberado) === "sim" && mesmaConta;
  const sandbox = String(ambiente) === "sandbox";
  if (!geral && !teste && !sandbox) return "";
  if (!emailConfirmado) return "confirmar";
  if (geral) return "geral";
  if (teste) return "teste";
  return "sandbox";
}

export function planoConciliacao({ destinoOk, resultados, cobrancasAbertas }) {
  const lista = Array.isArray(resultados) ? resultados : [];
  const falha = lista.some((item) => item.resultado === "falhou" || item.resultado === "consulta_indisponivel" || item.divergencia);
  if (!destinoOk) {
    const alerta = falha || Number(cobrancasAbertas) > 0;
    return { status: alerta ? 500 : 200, corpo: { ok: !alerta, consulta: "bloqueada", alerta, resultados: lista } };
  }
  return { status: falha ? 500 : 200, corpo: { ok: !falha, consulta: "asaas", alerta: falha, resultados: lista } };
}

export function eventoAceito(evento) {
  if (!evento || typeof evento !== "object") return false;
  const id = String(evento.id || "").trim();
  const tipo = String(evento.event || "").trim();
  const cobranca = String(evento.payment?.id || "").trim();
  return id.length >= 4 && tipo.length > 0 && cobranca.length > 0;
}

export function respostaDoWebhook({ erroPersistencia, repetir, processar, erroProcessamento, resultado }) {
  if (erroPersistencia) return { status: 500, corpo: "Falha ao registrar" };
  if (repetir) return { status: 409, corpo: "Ainda não" };
  if (erroProcessamento) return { status: 200, corpo: { ok: true, resultado: "falhou", reprocessar: true } };
  if (!processar) return { status: 200, corpo: { ok: true, resultado: resultado || "repetido" } };
  return { status: 200, corpo: { ok: true, resultado: "recebido" } };
}

export function eventoDeConsulta(statusGateway) {
  const status = String(statusGateway || "").toUpperCase();
  if (status === "RECEIVED" || status === "RECEIVED_IN_CASH") return "PAYMENT_RECEIVED";
  if (status === "CONFIRMED") return "PAYMENT_CONFIRMED";
  if (status === "OVERDUE") return "PAYMENT_OVERDUE";
  if (status === "REFUNDED") return "PAYMENT_REFUNDED";
  if (status === "DELETED" || status === "CANCELED") return "PAYMENT_DELETED";
  return "";
}

export function segredosIguais(recebido, esperado) {
  const codificador = new TextEncoder();
  const a = codificador.encode(String(recebido || ""));
  const b = codificador.encode(String(esperado || ""));
  if (a.length !== b.length || a.length === 0) return false;
  let diferenca = 0;
  for (let indice = 0; indice < a.length; indice += 1) diferenca |= a[indice] ^ b[indice];
  return diferenca === 0;
}

export function situacaoAsaas({ statusCobranca, statusGateway, valorEsperado, valorGateway }) {
  const recebido = String(statusGateway || "").toUpperCase();
  if (recebido === "RECEIVED" || recebido === "RECEIVED_IN_CASH") {
    return decidirEvento({
      status: statusCobranca,
      tipo: "PAYMENT_RECEIVED",
      valorEsperado,
      valorRecebido: valorGateway,
    });
  }
  if (recebido === "CONFIRMED") {
    return decidirEvento({
      status: statusCobranca,
      tipo: "PAYMENT_CONFIRMED",
      valorEsperado,
      valorRecebido: valorGateway,
    });
  }
  if (recebido === "OVERDUE") {
    return decidirEvento({ status: statusCobranca, tipo: "PAYMENT_OVERDUE", valorEsperado, valorRecebido: valorGateway });
  }
  if (recebido === "REFUNDED") {
    return decidirEvento({ status: statusCobranca, tipo: "PAYMENT_REFUNDED", valorEsperado, valorRecebido: valorGateway });
  }
  if (recebido === "DELETED" || recebido === "CANCELED") {
    return decidirEvento({ status: statusCobranca, tipo: "PAYMENT_DELETED", valorEsperado, valorRecebido: valorGateway });
  }
  return { status: statusCobranca, liberar: false, resultado: "ignorado" };
}

export function decidirEvento({ status, tipo, valorEsperado, valorRecebido }) {
  const centavosEsperados = Math.round(Number(valorEsperado) * 100);
  const centavosRecebidos = valorRecebido == null ? null : Math.round(Number(valorRecebido) * 100);
  if (tipo === "PAYMENT_RECEIVED") {
    if (["estornada", "cancelada", "analise"].includes(status)) {
      return { status: "analise", liberar: false, resultado: "analise" };
    }
    if (status === "pago") return { status: "pago", liberar: false, resultado: "repetido" };
    if (centavosRecebidos == null || centavosRecebidos !== centavosEsperados) {
      return { status: "analise", liberar: false, resultado: "analise" };
    }
    return { status: "pago", liberar: true, resultado: "pago", confirmacao: "asaas" };
  }
  if (tipo === "PAYMENT_CONFIRMED") {
    return { status, liberar: false, resultado: "confirmado_sem_liberar" };
  }
  if (tipo === "PAYMENT_OVERDUE" && ["criada", "pendente"].includes(status)) {
    return { status: "expirada", liberar: false, resultado: "expirada" };
  }
  if (tipo === "PAYMENT_DELETED" && ["criada", "pendente", "expirada"].includes(status)) {
    return { status: "cancelada", liberar: false, resultado: "cancelada" };
  }
  if (tipo === "PAYMENT_PARTIALLY_REFUNDED") {
    return { status: "analise", liberar: false, resultado: "analise" };
  }
  if (tipo === "PAYMENT_REFUNDED" && status === "pago") {
    return { status: "estornada", liberar: false, resultado: "estornada" };
  }
  if (["PAYMENT_CREATED", "PAYMENT_UPDATED"].includes(tipo) && status === "criada") {
    return { status: "pendente", liberar: false, resultado: "pendente" };
  }
  return { status, liberar: false, resultado: "ignorado" };
}
