import { createClient } from "jsr:@supabase/supabase-js@2";
import { cabecalhos, responder } from "../_shared/cors.ts";
import {
  acessoCobranca,
  cobrancaCompativel,
  decidirCliente,
  decidirConsultaCobranca,
  decidirPosCriacao,
  decidirRetomada,
  destinoAsaas,
  diagnosticoAsaas,
  documentoValido,
  eventoDeConsulta,
  identificadorAutenticado,
  mensagemParaCliente,
  organizarPedido,
  valorAceitoAsaas,
} from "../_shared/regras.mjs";

function claimsDoToken(autorizacao: string) {
  const token = autorizacao.replace(/^Bearer\s+/i, "").trim();
  const parte = token.split(".")[1] || "";
  try {
    const json = JSON.parse(atob(parte.replace(/-/g, "+").replace(/_/g, "/")));
    return { sub: String(json.sub || ""), sessionId: String(json.session_id || "") };
  } catch {
    return { sub: "", sessionId: "" };
  }
}

function destinoPara(modo: string) {
  return destinoAsaas({
    ambiente: Deno.env.get("ASAAS_AMBIENTE") || "",
    producaoLiberada: modo === "geral" ? "sim" : "",
    testeLiberado: modo === "teste" ? "sim" : "",
    baseInformada: Deno.env.get("ASAAS_BASE_URL") || "",
    chave: Deno.env.get("ASAAS_API_KEY") || "",
  });
}

function modoDaConta(usuarioId: string, emailConfirmado: boolean) {
  return acessoCobranca({
    ambiente: Deno.env.get("ASAAS_AMBIENTE") || "",
    usuarioId,
    emailConfirmado,
    contaTeste: Deno.env.get("ASAAS_CONTA_TESTE") || "",
    testeLiberado: Deno.env.get("ASAAS_TESTE_LIBERADO") || "",
    producaoLiberada: Deno.env.get("ASAAS_PRODUCAO_LIBERADA") || "",
  });
}

async function asaas(base: string, caminho: string, chave: string, metodo: string, corpo?: unknown) {
  let resposta: Response;
  try {
    resposta = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: { access_token: chave, "Content-Type": "application/json" },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    return { ok: false, status: 504, json: {} as Record<string, unknown>, jsonValido: false };
  }
  const texto = await resposta.text();
  if (!texto) return { ok: resposta.ok, status: resposta.status, json: {} as Record<string, unknown>, jsonValido: true };
  try {
    const json = JSON.parse(texto);
    if (!json || typeof json !== "object" || Array.isArray(json)) {
      return { ok: resposta.ok, status: resposta.status, json: {} as Record<string, unknown>, jsonValido: false };
    }
    return { ok: resposta.ok, status: resposta.status, json: json as Record<string, unknown>, jsonValido: true };
  } catch {
    return { ok: resposta.ok, status: resposta.status, json: {} as Record<string, unknown>, jsonValido: false };
  }
}

function registrar(etapa: string, resposta: { status?: number; json?: Record<string, unknown>; jsonValido?: boolean }, correlacao: string) {
  console.error(JSON.stringify(diagnosticoAsaas({
    etapa,
    status: resposta?.status,
    json: resposta?.json,
    jsonValido: resposta?.jsonValido,
    correlacao,
  })));
}

function primeiroId(json: Record<string, unknown>) {
  const lista = Array.isArray(json.data) ? json.data : [];
  const item = lista[0] as { id?: string } | undefined;
  return item?.id ? String(item.id) : "";
}

Deno.serve(async (req) => {
  const origem = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cabecalhos(origem) });
  if (req.method !== "POST") return responder(origem, 405, { ok: false, mensagem: "Método não aceito." });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviço = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const chaveAsaas = Deno.env.get("ASAAS_API_KEY") || "";
  if (!url || !anon || !serviço || !chaveAsaas) {
    return responder(origem, 503, { ok: false, mensagem: "A cobrança automática ainda não está configurada." });
  }

  const autorizacao = req.headers.get("Authorization") || "";
  const usuario = createClient(url, anon, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  });
  const { data: conta, error: erroConta } = await usuario.auth.getUser();
  if (erroConta || !conta.user) return responder(origem, 401, { ok: false, mensagem: "Entre na conta para comprar." });
  const claims = claimsDoToken(autorizacao);
  const usuarioId = identificadorAutenticado({
    usuarioId: conta.user.id,
    subject: claims.sub,
    sessionId: claims.sessionId,
  });
  if (!usuarioId) return responder(origem, 401, { ok: false, mensagem: "Entre na conta para comprar." });

  const pedido = await req.json().catch(() => null);
  const modo = modoDaConta(usuarioId, Boolean(conta.user.email_confirmed_at));
  const destino = destinoPara(modo);
  if (pedido?.consulta === "acesso") {
    return responder(origem, 200, { ok: true, automatico: (modo === "teste" || modo === "geral") && destino.ok });
  }
  if (modo === "confirmar") {
    return responder(origem, 403, { ok: false, mensagem: "Confirme o e-mail antes de comprar." });
  }
  if ((modo !== "teste" && modo !== "geral" && modo !== "sandbox") || !destino.ok) {
    return responder(origem, 503, { ok: false, mensagem: "A cobrança automática ainda não está configurada." });
  }

  const admin = createClient(url, serviço, { auth: { persistSession: false } });
  if (["retomar", "situacao", "cancelar", "ocultar", "mostrar"].includes(pedido?.consulta)) {
    return await consultaDoPedido({
      origem,
      admin,
      usuario,
      usuarioId,
      pedido,
      destino,
      chaveAsaas,
    });
  }

  const atividades = Array.isArray(pedido?.atividades) ? pedido.atividades.map(String) : [];
  const oficial = await totalOficial(admin, atividades);
  if (!oficial.ok) {
    return responder(origem, 400, { ok: false, mensagem: "Não foi possível confirmar o preço. Nenhum Pix foi gerado." });
  }
  if (!valorAceitoAsaas(oficial.valor)) {
    return responder(origem, 400, {
      ok: false,
      acao: "abaixo",
      mensagem: "O Asaas não cria cobrança abaixo de R$ 5,00. Nenhum Pix foi gerado e nenhum pedido novo foi aberto. Não pague.",
    });
  }
  const documento = String(pedido?.documento || "").replace(/\D/g, "");
  const aberta = await cobrancaAberta(admin, usuarioId, atividades);
  let chave = aberta?.chave_idempotencia || String(pedido?.chave || "");

  const base = destino.base;
  const buscaCliente = await asaas(
    base,
    `/customers?externalReference=${encodeURIComponent(usuarioId)}&limit=1`,
    chaveAsaas,
    "GET",
  );
  const clienteDecidido = decidirCliente({
    ok: buscaCliente.ok,
    status: buscaCliente.status,
    jsonValido: buscaCliente.jsonValido,
    id: buscaCliente.ok && buscaCliente.jsonValido ? primeiroId(buscaCliente.json) : "",
  });
  if (clienteDecidido.acao === "aguardar") {
    registrar("buscar_cliente", buscaCliente, "");
    return responder(origem, 502, { ok: false, mensagem: "Não consegui confirmar seu cadastro no Asaas. Tente de novo. Não pague ainda." });
  }
  let clienteId = clienteDecidido.id || "";
  if (!clienteId && !documentoValido(documento)) {
    return responder(origem, 400, { ok: false, mensagem: "Informe um CPF ou CNPJ válido para gerar o Pix." });
  }

  const { data: preparo, error: erroPreparo } = await usuario.rpc("preparar_cobranca", { atividades, chave });
  if (erroPreparo || !preparo?.ok) {
    return responder(origem, 400, { ok: false, mensagem: erroPreparo?.message || "Não foi possível abrir o pedido." });
  }
  if (preparo.copia_cola) {
    return responder(origem, 200, {
      ok: true,
      txid: preparo.txid,
      valor: preparo.valor_bruto,
      copiaCola: preparo.copia_cola,
      expiraEm: preparo.expira_em,
      status: preparo.status,
    });
  }
  if (preparo.status === "pago") {
    return responder(origem, 200, { ok: true, txid: preparo.txid, valor: preparo.valor_bruto, status: "pago" });
  }

  let externa = String(preparo.cobranca_externa || "");
  if (!externa) {
    const buscaCobranca = await asaas(
      base,
      `/payments?externalReference=${encodeURIComponent(preparo.txid)}&limit=1`,
      chaveAsaas,
      "GET",
    );
    const consulta = decidirConsultaCobranca({
      ok: buscaCobranca.ok,
      status: buscaCobranca.status,
      jsonValido: buscaCobranca.jsonValido,
      id: buscaCobranca.ok && buscaCobranca.jsonValido ? primeiroId(buscaCobranca.json) : "",
    });
    if (consulta.acao === "aguardar") {
      registrar("buscar_cobranca", buscaCobranca, String(preparo.txid || ""));
      return responder(origem, 502, { ok: false, mensagem: "Não consegui confirmar se esta cobrança já existe. Não gere outro Pix ainda." });
    }
    if (consulta.acao === "reconciliar") externa = consulta.id;
  }

  if (!externa) {
    if (!clienteId) {
      const nome = conta.user.user_metadata?.nome || conta.user.email || "Cliente";
      const cliente = await asaas(base, "/customers", chaveAsaas, "POST", {
        name: nome,
        email: conta.user.email,
        cpfCnpj: documento,
        notificationDisabled: true,
        externalReference: usuarioId,
      });
      clienteId = String(cliente.json.id || "");
      if (cliente.status === 504) {
        const deNovo = await asaas(
          base,
          `/customers?externalReference=${encodeURIComponent(usuarioId)}&limit=1`,
          chaveAsaas,
          "GET",
        );
        clienteId = deNovo.ok ? primeiroId(deNovo.json) : "";
      }
      if (!clienteId) {
        registrar("criar_cliente", cliente, String(preparo.txid || ""));
        return responder(origem, 502, { ok: false, mensagem: "O Asaas não abriu o cliente. Confira o CPF ou CNPJ e tente de novo." });
      }
    }

    if (!valorAceitoAsaas(preparo.valor_bruto)) {
      return responder(origem, 400, {
        ok: false,
        acao: "abaixo",
        mensagem: "O Asaas não cria cobrança abaixo de R$ 5,00. Nenhum Pix foi gerado. Não pague.",
      });
    }
    const vencimento = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const cobranca = await asaas(base, "/payments", chaveAsaas, "POST", {
      customer: clienteId,
      billingType: "PIX",
      value: preparo.valor_bruto,
      dueDate: vencimento,
      externalReference: preparo.txid,
      description: "Inclusão no Cotidiano",
    });
    let depois = decidirPosCriacao({
      criacao: {
        id: cobranca.jsonValido ? String(cobranca.json.id || "") : "",
        status: cobranca.status,
        ok: cobranca.ok,
        jsonValido: cobranca.jsonValido,
      },
      consulta: null,
    });
    if (depois.acao !== "gravar") {
      const recuperada = await asaas(
        base,
        `/payments?externalReference=${encodeURIComponent(preparo.txid)}&limit=1`,
        chaveAsaas,
        "GET",
      );
      depois = decidirPosCriacao({
        criacao: {
          id: cobranca.jsonValido ? String(cobranca.json.id || "") : "",
          status: cobranca.status,
          ok: cobranca.ok,
          jsonValido: cobranca.jsonValido,
        },
        consulta: {
          id: recuperada.ok && recuperada.jsonValido ? primeiroId(recuperada.json) : "",
          status: recuperada.status,
          ok: recuperada.ok,
          jsonValido: recuperada.jsonValido,
        },
      });
      if (depois.acao !== "gravar") registrar("confirmar_cobranca", recuperada, String(preparo.txid || ""));
    }
    if (depois.acao !== "gravar") {
      registrar("criar_cobranca", cobranca, String(preparo.txid || ""));
      const aviso = mensagemParaCliente(diagnosticoAsaas({
        etapa: "criar_cobranca",
        status: cobranca.status,
        json: cobranca.json,
        jsonValido: cobranca.jsonValido,
        correlacao: preparo.txid,
      }));
      return responder(origem, 502, { ok: false, mensagem: aviso || depois.mensagem });
    }
    externa = depois.id;
    await admin.rpc("gravar_pix_cobranca", {
      cobranca: preparo.cobranca_id,
      externa,
      codigo_pix: null,
      expira: null,
    });
  }

  const qr = await asaas(base, `/payments/${externa}/pixQrCode`, chaveAsaas, "GET");
  const copiaCola = String(qr.json.payload || "");
  if (!qr.ok || !copiaCola) {
    registrar("buscar_qr", qr, String(preparo.txid || ""));
    return responder(origem, 502, { ok: false, mensagem: "A cobrança existe, mas o Pix ainda não voltou. Use o mesmo pedido para tentar de novo." });
  }

  const gravado = await admin.rpc("gravar_pix_cobranca", {
    cobranca: preparo.cobranca_id,
    externa,
    codigo_pix: copiaCola,
    expira: qr.json.expirationDate || null,
  });
  if (gravado.error || !gravado.data?.ok) {
    return responder(origem, 500, { ok: false, mensagem: "O Pix foi criado e precisa de conferência. Não pague de novo ainda." });
  }

  return responder(origem, 200, {
    ok: true,
    txid: preparo.txid,
    valor: preparo.valor_bruto,
    copiaCola,
    imagem: qr.json.encodedImage || "",
    expiraEm: qr.json.expirationDate || null,
    status: "pendente",
  });
});

function taxaDe(pagamento) {
  if (pagamento?.value == null || pagamento?.netValue == null) return null;
  return Number((Number(pagamento.value) - Number(pagamento.netValue)).toFixed(2));
}

function txidValido(valor) {
  return /^[A-Za-z0-9]{8,40}$/.test(String(valor || ""));
}

async function totalOficial(admin, atividades) {
  const ids = atividades.map(String).filter(Boolean);
  if (!ids.length || ids.length > 12 || new Set(ids).size !== ids.length) return { ok: false, valor: 0 };
  const { data, error } = await admin.from("atividades").select("id, preco, arquivada_em").in("id", ids);
  if (error || !data || data.length !== ids.length) return { ok: false, valor: 0 };
  if (data.some((item) => item.arquivada_em)) return { ok: false, valor: 0 };
  const centavos = data.reduce((soma, item) => soma + Math.round(Number(item.preco) * 100), 0);
  return { ok: true, valor: centavos / 100 };
}

async function cobrancaAberta(admin, usuarioId, atividades) {
  const { data, error } = await admin
    .from("cobrancas")
    .select("txid, status, chave_idempotencia, criado_em")
    .eq("usuario_id", usuarioId)
    .in("status", ["criada", "pendente"]);
  if (error || !data?.length) return null;
  const pedidos = await admin
    .from("pedidos")
    .select("txid, atividade_id")
    .eq("usuario_id", usuarioId)
    .in("txid", data.map((item) => item.txid));
  if (pedidos.error) return null;
  const ids = new Map();
  for (const item of pedidos.data || []) {
    const atual = ids.get(item.txid) || [];
    atual.push(item.atividade_id);
    ids.set(item.txid, atual);
  }
  const compativel = cobrancaCompativel(
    data.map((item) => ({
      txid: item.txid,
      status: item.status,
      criadoEm: item.criado_em,
      chave: item.chave_idempotencia,
      atividades: ids.get(item.txid) || [],
    })),
    atividades,
  );
  if (!compativel?.chave) return null;
  return { chave_idempotencia: compativel.chave };
}

async function registroDoUsuario(admin, usuarioId, txid) {
  const pedidos = await admin
    .from("pedidos")
    .select("atividade_id, titulo, valor, status")
    .eq("usuario_id", usuarioId)
    .eq("txid", txid);
  if (pedidos.error || !pedidos.data?.length) return null;
  const cobranca = await admin
    .from("cobrancas")
    .select("id, status, cobranca_externa, copia_cola, expira_em, valor_bruto")
    .eq("usuario_id", usuarioId)
    .eq("txid", txid)
    .maybeSingle();
  const direitos = await admin
    .from("direitos_acesso")
    .select("id")
    .eq("usuario_id", usuarioId)
    .eq("txid", txid)
    .is("revogado_em", null);
  return {
    pedidos: pedidos.data,
    cobranca: cobranca.data || null,
    direito: Boolean(direitos.data?.length),
  };
}

async function aplicarConsulta(admin, cobranca, pagamento) {
  const tipo = eventoDeConsulta(pagamento?.status);
  if (!cobranca?.cobranca_externa || !tipo) return;
  const evento = `consulta:${cobranca.cobranca_externa}:${tipo}`;
  const registrado = await admin.rpc("receber_evento_asaas", {
    evento_externo: evento,
    tipo,
    cobranca_externa: cobranca.cobranca_externa,
    valor_recebido: pagamento.value ?? null,
    taxa_recebida: taxaDe(pagamento),
    liquido_recebido: pagamento.netValue ?? null,
  });
  if (registrado.error || registrado.data?.repetir || !registrado.data?.processar) return;
  await admin.rpc("processar_evento_asaas", { evento_externo: evento });
}

function camposDeOrganizacao(acao: string) {
  const organizacao = organizarPedido(acao);
  return { cancelavel: organizacao.cancelavel, ocultavel: organizacao.ocultavel };
}

async function consultaDoPedido({ origem, admin, usuario, usuarioId, pedido, destino, chaveAsaas }) {
  const txid = String(pedido?.txid || "");
  if (!txidValido(txid)) {
    return responder(origem, 400, { ok: false, mensagem: "Não encontrei este pedido na sua conta." });
  }
  let registro = await registroDoUsuario(admin, usuarioId, txid);
  if (!registro) {
    return responder(origem, 404, { ok: false, mensagem: "Não encontrei este pedido na sua conta." });
  }
  const remota = registro.cobranca?.cobranca_externa && destino.ok
    ? await asaas(destino.base, `/payments/${registro.cobranca.cobranca_externa}`, chaveAsaas, "GET")
    : null;
  if (pedido.consulta === "situacao" && remota?.ok && remota.jsonValido) {
    await aplicarConsulta(admin, registro.cobranca, remota.json);
    registro = await registroDoUsuario(admin, usuarioId, txid) || registro;
  }
  const cobranca = registro.cobranca;
  const valor = Number(cobranca?.valor_bruto ?? registro.pedidos.reduce((soma, item) => soma + Number(item.valor || 0), 0));
  let ausenciaConfirmada = false;
  if (cobranca && !cobranca.cobranca_externa && !cobranca.copia_cola && destino.ok) {
    const busca = await asaas(
      destino.base,
      `/payments?externalReference=${encodeURIComponent(txid)}&limit=1`,
      chaveAsaas,
      "GET",
    );
    const consulta = decidirConsultaCobranca({
      ok: busca.ok,
      status: busca.status,
      jsonValido: busca.jsonValido,
      id: busca.ok && busca.jsonValido ? primeiroId(busca.json) : "",
    });
    if (consulta.acao === "reconciliar" && consulta.id) {
      await admin.rpc("gravar_pix_cobranca", {
        cobranca: cobranca.id,
        externa: consulta.id,
        codigo_pix: null,
        expira: null,
      });
      registro = await registroDoUsuario(admin, usuarioId, txid) || registro;
    }
    ausenciaConfirmada = consulta.acao === "criar";
  }
  const cobrancaAtual = registro.cobranca;
  const decisao = decidirRetomada({
    encontrada: true,
    statusPedido: registro.pedidos.every((item) => item.status === "pago")
      ? "pago"
      : registro.pedidos.some((item) => item.status === "estornado")
        ? "estornado"
        : registro.pedidos.every((item) => item.status === "cancelado")
          ? "cancelado"
          : registro.pedidos[0].status,
    statusCobranca: cobrancaAtual?.status || "",
    temPix: Boolean(cobrancaAtual?.copia_cola),
    temExterna: Boolean(cobrancaAtual?.cobranca_externa),
    expiraEm: cobrancaAtual?.expira_em || "",
    direito: registro.direito,
    valor,
    ausenciaConfirmada,
  });
  const mensagens = {
    tentar: "O Pix não chegou a ser gerado. Nenhuma cobrança foi encontrada no Asaas. Você pode tentar de novo pelo mesmo pedido.",
    abaixo: "Esta tentativa não criou cobrança. O Asaas não aceita valor abaixo de R$ 5,00. Não pague e não gere outro Pix deste pedido.",
    aguardar: "Não consegui confirmar se esta cobrança já existe. Não gere outro Pix ainda.",
    vencido: "O prazo deste Pix terminou. Uma nova cobrança só é criada depois que o estado anterior for confirmado.",
    analise: "Este pagamento está em análise. O PDF continua bloqueado. Fale com a Letícia e informe o pedido.",
    estornado: "Este pagamento foi estornado. O PDF continua bloqueado.",
    cancelado: "Esta cobrança foi cancelada. O PDF continua bloqueado.",
    tentativa: "A tentativa foi cancelada. Nenhum Pix foi gerado e os registros continuam guardados.",
    confirmar: "O pagamento foi confirmado. O material aparece quando a liberação estiver pronta.",
    baixar: "Pagamento confirmado.",
    manual: "Este pedido é Pix manual, não uma cobrança do Asaas. Se você já pagou o QR anterior, não gere outro.",
    continuar: "O Pix continua válido. Use o mesmo código para pagar.",
  };
  if (pedido.consulta === "cancelar" || pedido.consulta === "ocultar" || pedido.consulta === "mostrar") {
    return await responderOrganizacao({ origem, usuario, txid, pedido, decisao, registro, ausenciaConfirmada, cobranca: cobrancaAtual });
  }
  if (pedido.consulta === "situacao" || decisao.acao === "negar") {
    return responder(origem, 200, {
      ok: true,
      acao: decisao.acao,
      status: cobrancaAtual?.status || registro.pedidos[0].status,
      mensagem: mensagens[decisao.acao] || "Não encontrei este pedido na sua conta.",
      renovavel: decisao.renovavel,
      liberado: decisao.acao === "baixar",
      ...camposDeOrganizacao(decisao.acao),
    });
  }
  if (decisao.acao === "recuperar" && cobrancaAtual?.cobranca_externa && destino.ok) {
    const qr = await asaas(destino.base, `/payments/${cobrancaAtual.cobranca_externa}/pixQrCode`, chaveAsaas, "GET");
    const copiaCola = String(qr.json?.payload || "");
    if (qr.ok && copiaCola) {
      await admin.rpc("gravar_pix_cobranca", {
        cobranca: cobrancaAtual.id,
        externa: cobrancaAtual.cobranca_externa,
        codigo_pix: copiaCola,
        expira: qr.json.expirationDate || null,
      });
      return responder(origem, 200, respostaPix(registro, txid, copiaCola, qr.json.encodedImage || "", qr.json.expirationDate || cobrancaAtual.expira_em));
    }
  }
  if (decisao.acao === "continuar" && cobrancaAtual?.copia_cola) {
    let imagem = "";
    if (cobrancaAtual.cobranca_externa && destino.ok) {
      const qr = await asaas(destino.base, `/payments/${cobrancaAtual.cobranca_externa}/pixQrCode`, chaveAsaas, "GET");
      imagem = qr.ok ? String(qr.json?.encodedImage || "") : "";
    }
    return responder(origem, 200, respostaPix(registro, txid, cobrancaAtual.copia_cola, imagem, cobrancaAtual.expira_em));
  }
  return responder(origem, 200, {
    ok: true,
    acao: decisao.acao,
    mensagem: mensagens[decisao.acao] || "Ainda não há um Pix para continuar.",
    txid,
    valor: cobrancaAtual?.valor_bruto ?? registro.pedidos[0].valor,
    titulos: registro.pedidos.map((item) => item.titulo),
    expiraEm: cobranca?.expira_em || "",
    renovavel: decisao.renovavel,
    liberado: decisao.acao === "baixar",
    ...camposDeOrganizacao(decisao.acao),
  });
}

async function responderOrganizacao({ origem, usuario, txid, pedido, decisao, registro, ausenciaConfirmada, cobranca }) {
  if (pedido.consulta === "cancelar") {
    const pago = ["baixar", "confirmar"].includes(decisao.acao) || registro.pedidos.some((item) => item.status === "pago");
    const remota = Boolean(cobranca?.cobranca_externa || cobranca?.copia_cola);
    if (pago || remota || !ausenciaConfirmada || !organizarPedido(decisao.acao).cancelavel) {
      return responder(origem, 409, {
        ok: false,
        acao: pago ? "confirmar" : remota ? "asaas_aberto" : decisao.acao,
        mensagem: pago
          ? "Este pedido já tem pagamento confirmado e não pode ser cancelado."
          : remota
            ? "Existe cobrança no Asaas. O cancelamento dessa cobrança não foi feito."
            : "Não consegui confirmar a ausência da cobrança. O pedido não foi cancelado.",
      });
    }
    const { data, error } = await usuario.rpc("cancelar_tentativa_sem_cobranca", { codigo: txid });
    if (error || data?.ok === false) {
      return responder(origem, 409, { ok: false, mensagem: data?.mensagem || "Não foi possível cancelar este pedido." });
    }
    return responder(origem, 200, {
      ok: true,
      acao: "tentativa",
      mensagem: data?.mensagem || "A tentativa foi cancelada. Os registros continuam guardados.",
      repetido: data?.repetido === true,
      cancelavel: false,
      ocultavel: true,
    });
  }
  if (pedido.consulta === "ocultar" && !organizarPedido(decisao.acao).ocultavel) {
    return responder(origem, 409, { ok: false, mensagem: "Esta compra permanece visível." });
  }
  const { data, error } = await usuario.rpc("definir_visibilidade_pedido", {
    codigo: txid,
    ocultar: pedido.consulta === "ocultar",
  });
  if (error || data?.ok === false) {
    return responder(origem, 409, { ok: false, mensagem: data?.mensagem || "Não foi possível atualizar a visualização." });
  }
  return responder(origem, 200, {
    ok: true,
    acao: decisao.acao,
    oculto: data?.oculto === true,
    mensagem: data?.mensagem || "",
    ...camposDeOrganizacao(decisao.acao),
  });
}

function respostaPix(registro, txid, copiaCola, imagem, expiraEm) {
  return {
    ok: true,
    acao: "continuar",
    mensagem: "Este é o mesmo Pix. Não gere outro.",
    txid,
    valor: registro.cobranca?.valor_bruto ?? registro.pedidos[0].valor,
    titulos: registro.pedidos.map((item) => item.titulo),
    copiaCola,
    imagem,
    expiraEm: expiraEm || "",
    liberado: false,
    cancelavel: false,
    ocultavel: false,
  };
}
