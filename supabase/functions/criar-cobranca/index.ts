import { createClient } from "jsr:@supabase/supabase-js@2";
import { cabecalhos, responder } from "../_shared/cors.ts";
import { acessoCobranca, destinoAsaas, documentoValido, identificadorAutenticado } from "../_shared/regras.mjs";

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
    return { ok: false, status: 504, json: {} as Record<string, unknown> };
  }
  const texto = await resposta.text();
  let json: Record<string, unknown> = {};
  try {
    json = texto ? JSON.parse(texto) : {};
  } catch {
    json = {};
  }
  return { ok: resposta.ok, status: resposta.status, json };
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

  const atividades = Array.isArray(pedido?.atividades) ? pedido.atividades.map(String) : [];
  const chave = String(pedido?.chave || "");
  const documento = String(pedido?.documento || "").replace(/\D/g, "");
  const admin = createClient(url, serviço, { auth: { persistSession: false } });

  const base = destino.base;
  const buscaCliente = await asaas(
    base,
    `/customers?externalReference=${encodeURIComponent(usuarioId)}&limit=1`,
    chaveAsaas,
    "GET",
  );
  if (buscaCliente.status === 504) {
    return responder(origem, 502, { ok: false, mensagem: "Não consegui confirmar seu cadastro no Asaas. Tente de novo. Não pague ainda." });
  }
  let clienteId = buscaCliente.ok ? primeiroId(buscaCliente.json) : "";
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
    if (buscaCobranca.status === 504) {
      return responder(origem, 502, { ok: false, mensagem: "Não consegui confirmar se esta cobrança já existe. Não gere outro Pix ainda." });
    }
    externa = buscaCobranca.ok ? primeiroId(buscaCobranca.json) : "";
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
        return responder(origem, 502, { ok: false, mensagem: "O Asaas não abriu o cliente. Confira o CPF ou CNPJ e tente de novo." });
      }
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
    externa = String(cobranca.json.id || "");
    if (!externa) {
      const recuperada = await asaas(
        base,
        `/payments?externalReference=${encodeURIComponent(preparo.txid)}&limit=1`,
        chaveAsaas,
        "GET",
      );
      externa = recuperada.ok ? primeiroId(recuperada.json) : "";
    }
    if (!externa) {
      if (cobranca.status !== 504 && !preparo.repetida) {
        await admin.rpc("desfazer_cobranca_sem_pix", { cobranca: preparo.cobranca_id });
      }
      return responder(origem, 502, { ok: false, mensagem: "O Asaas não criou a cobrança. Se o Pix não aparecer, não pague de novo ainda." });
    }
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
