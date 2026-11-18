function verificador(base, pesos) {
  const soma = base.split("").reduce((total, digito, indice) => total + Number(digito) * pesos[indice], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function descricaoSegura(valor) {
  const texto = String(valor || "").replace(/\s+/g, " ").trim();
  if (!texto || texto.length > 180) return "";
  const limpa = texto
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .replace(/\d{6,}/g, "")
    .replace(/bearer\s+\S+/gi, "")
    .replace(/\$aact_\S+/gi, "")
    .replace(/access_token\S*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!limpa || /@|bearer|aact_|access_token/i.test(limpa)) return "";
  return limpa;
}

export function diagnosticoAsaas({ etapa, status, json, jsonValido, correlacao }) {
  const erros = Array.isArray(json?.errors) ? json.errors : [];
  const codigos = [];
  for (const item of erros) {
    const codigo = String(item?.code || "").trim();
    if (/^[a-z0-9_]{1,40}$/i.test(codigo) && !codigos.includes(codigo)) codigos.push(codigo);
  }
  return {
    evento: "asaas",
    etapa: String(etapa || ""),
    status: Number(status) || 0,
    json_valido: jsonValido !== false,
    codigos,
    descricao: descricaoSegura(erros.map((item) => item?.description || "").join(" ")),
    correlacao: String(correlacao || "").slice(0, 40),
  };
}

export function decidirCliente(busca) {
  if (!busca || busca.status === 504 || busca.jsonValido === false || !busca.ok) return { acao: "aguardar" };
  if (busca.id) return { acao: "reutilizar", id: String(busca.id) };
  return { acao: "criar" };
}

export function decidirConsultaCobranca(consulta) {
  if (!consulta || consulta.status === 504 || consulta.jsonValido === false || !consulta.ok) return { acao: "aguardar" };
  if (consulta.id) return { acao: "reconciliar", id: String(consulta.id) };
  return { acao: "criar" };
}

export function decidirPosCriacao({ criacao, consulta }) {
  const idCriado = criacao?.id ? String(criacao.id) : "";
  const idConsulta = consulta?.id ? String(consulta.id) : "";
  if (idCriado) return { acao: "gravar", id: idCriado, apagar: false };
  if (idConsulta) return { acao: "gravar", id: idConsulta, apagar: false };
  const inconclusiva = !criacao
    || criacao.status === 504
    || criacao.jsonValido === false
    || Number(criacao.status) >= 500
    || !Number(criacao.status);
  const ausenciaConfirmada = Boolean(
    consulta
    && consulta.ok
    && consulta.jsonValido !== false
    && !idConsulta
    && Number(consulta.status) >= 200
    && Number(consulta.status) < 300,
  );
  if (!ausenciaConfirmada || inconclusiva) {
    return {
      acao: "preservar",
      apagar: false,
      mensagem: "Não consegui confirmar se esta cobrança já existe. Não gere outro Pix ainda.",
    };
  }
  return {
    acao: "preservar",
    apagar: false,
    mensagem: "O Asaas não criou a cobrança. Se o Pix não aparecer, não pague de novo ainda.",
  };
}

export const MINIMO_ASAAS_CENTAVOS = 500;

export function valorAceitoAsaas(valor) {
  const centavos = Math.round(Number(valor) * 100);
  return Number.isFinite(centavos) && centavos >= MINIMO_ASAAS_CENTAVOS;
}

export function resultadoDoPreco({ ids, linhas, erro = false, consultado = false }) {
  const lista = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
  if (!lista.length || lista.length > 12 || new Set(lista).size !== lista.length) {
    return { ok: false, motivo: "produto", valor: 0, consultar: false, ids: lista };
  }
  if (!consultado) return { ok: false, motivo: "", valor: 0, consultar: true, ids: lista };
  if (erro) return { ok: false, motivo: "consulta", valor: 0, consultar: false, ids: lista };
  const encontradas = Array.isArray(linhas) ? linhas : [];
  const recebidas = new Set(encontradas.map((item) => String(item?.id || "")));
  if (recebidas.size !== lista.length || lista.some((id) => !recebidas.has(id))) {
    return { ok: false, motivo: "produto", valor: 0, consultar: false, ids: lista };
  }
  if (encontradas.some((item) => item?.arquivada_em)) {
    return { ok: false, motivo: "inativo", valor: 0, consultar: false, ids: lista };
  }
  const centavos = encontradas.reduce((soma, item) => soma + Math.round(Number(item?.preco) * 100), 0);
  if (!Number.isSafeInteger(centavos) || centavos <= 0) {
    return { ok: false, motivo: "consulta", valor: 0, consultar: false, ids: lista };
  }
  return { ok: true, motivo: "", valor: centavos / 100, consultar: false, ids: lista };
}

export function mensagemParaCliente(diagnostico) {
  const texto = String(diagnostico?.descricao || "");
  if (/n[aã]o pode ser menor que/i.test(texto)) {
    return "O Asaas não aceitou este valor. Nenhuma cobrança foi criada. Não pague.";
  }
  return "";
}

export function decidirRetomada({
  encontrada,
  statusPedido,
  statusCobranca,
  temPix,
  temExterna,
  expiraEm,
  direito,
  valor,
  ausenciaConfirmada,
  agora = Date.now(),
}) {
  if (!encontrada) return { acao: "negar", consultar: false, renovavel: false };
  if (statusPedido === "pago" && direito) return { acao: "baixar", consultar: false, renovavel: false };
  if (statusPedido === "pago") return { acao: "confirmar", consultar: true, renovavel: false };
  if (statusCobranca === "analise" || statusPedido === "analise") {
    return { acao: "analise", consultar: false, renovavel: false };
  }
  if (statusCobranca === "estornada" || statusPedido === "estornado") {
    return { acao: "estornado", consultar: false, renovavel: false };
  }
  if (statusCobranca === "cancelada" || statusPedido === "cancelado") {
    if (!temExterna && !temPix) return { acao: "tentativa", consultar: false, renovavel: false };
    return { acao: "cancelado", consultar: false, renovavel: false };
  }
  const limite = expiraEm ? Date.parse(expiraEm) : Number.NaN;
  if (statusCobranca === "expirada" || (Number.isFinite(limite) && limite <= agora)) {
    return { acao: "vencido", consultar: false, renovavel: statusCobranca === "expirada" };
  }
  if (!statusCobranca) return { acao: "manual", consultar: false, renovavel: false };
  if (temPix) return { acao: "continuar", consultar: true, renovavel: false };
  if (!temExterna) {
    if (!ausenciaConfirmada) return { acao: "aguardar", consultar: false, renovavel: false };
    if (!valorAceitoAsaas(valor)) return { acao: "abaixo", consultar: false, renovavel: false };
    return { acao: "tentar", consultar: false, renovavel: false };
  }
  return { acao: "recuperar", consultar: true, renovavel: false };
}

export function intervaloDaConsulta(acao) {
  return ["continuar", "recuperar", "confirmar"].includes(acao) ? 15000 : 0;
}

export function organizarPedido(acao) {
  return {
    cancelavel: acao === "abaixo" || acao === "tentar",
    ocultavel: ["abaixo", "tentar", "tentativa", "cancelado", "estornado", "negar", "vencido"].includes(acao),
  };
}

export function cobrancaCompativel(abertas, atividades) {
  const alvo = [...(atividades || [])].map(String).filter(Boolean).sort().join(",");
  if (!alvo) return null;
  const compativeis = (abertas || []).filter((item) => {
    const ids = [...(item?.atividades || [])].map(String).filter(Boolean).sort().join(",");
    return ids === alvo && ["criada", "pendente"].includes(item?.status);
  });
  if (!compativeis.length) return null;
  return [...compativeis].sort((a, b) => String(a.criadoEm || "").localeCompare(String(b.criadoEm || ""))).at(-1);
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
