import { createClient } from "jsr:@supabase/supabase-js@2";
import { destinoAsaas, eventoDeConsulta, planoConciliacao, segredosIguais } from "../_shared/regras.mjs";

function configuracao() {
  return destinoAsaas({
    ambiente: Deno.env.get("ASAAS_AMBIENTE") || "",
    leitura: true,
    baseInformada: Deno.env.get("ASAAS_BASE_URL") || "",
    chave: Deno.env.get("ASAAS_API_KEY") || "",
  });
}

function taxaDe(json) {
  if (json.value == null || json.netValue == null) return null;
  return Number((Number(json.value) - Number(json.netValue)).toFixed(2));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Método não aceito", { status: 405 });
  const esperado = Deno.env.get("CONCILIACAO_TOKEN") || "";
  const recebido = req.headers.get("x-conciliacao-token") || "";
  if (!esperado || !segredosIguais(recebido, esperado)) return new Response("Não autorizado", { status: 401 });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviço = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviço) return new Response("Não configurado", { status: 503 });

  const pedido = await req.json().catch(() => ({}));
  const txid = String(pedido?.txid || "");
  const admin = createClient(url, serviço, { auth: { persistSession: false } });
  const resultados = [];
  const vistos = new Set();

  for (let volta = 0; volta < 3; volta += 1) {
    const pendentes = await admin.from("eventos_pagamento").select("evento_externo").in("resultado", ["recebido", "falhou"]).limit(20);
    if (pendentes.error) return new Response("Falha ao ler eventos", { status: 500 });
    const novos = (pendentes.data || []).filter((item) => !vistos.has(item.evento_externo));
    if (!novos.length) break;
    for (const item of novos) {
      vistos.add(item.evento_externo);
      const processado = await admin.rpc("processar_evento_asaas", { evento_externo: item.evento_externo });
      resultados.push({
        origem: "reprocessamento",
        resultado: processado.error ? "falhou" : processado.data?.resultado || "falhou",
        divergencia: processado.data?.resultado === "analise",
      });
    }
  }

  const destino = configuracao();
  if (!destino.ok) {
    const abertas = await admin.from("cobrancas").select("id", { count: "exact", head: true }).in("status", ["criada", "pendente", "analise"]).not("cobranca_externa", "is", null);
    if (abertas.error) return new Response("Falha ao ler cobranças", { status: 500 });
    const plano = planoConciliacao({ destinoOk: false, resultados, cobrancasAbertas: abertas.count || 0 });
    return Response.json(plano.corpo, { status: plano.status });
  }

  let consulta = admin
    .from("cobrancas")
    .select("id, txid, valor_bruto, status, cobranca_externa")
    .in("status", ["criada", "pendente", "analise"])
    .not("cobranca_externa", "is", null)
    .limit(20);
  if (txid) {
    consulta = admin
      .from("cobrancas")
      .select("id, txid, valor_bruto, status, cobranca_externa")
      .eq("txid", txid)
      .limit(1);
  }
  const { data: cobrancas, error } = await consulta;
  if (error) return new Response("Falha ao ler cobranças", { status: 500 });

  for (const cobranca of cobrancas || []) {
    if (!cobranca.cobranca_externa) continue;
    let resposta;
    try {
      resposta = await fetch(`${destino.base}/payments/${cobranca.cobranca_externa}`, {
        headers: { access_token: Deno.env.get("ASAAS_API_KEY") || "" },
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      resultados.push({ txid: cobranca.txid, resultado: "consulta_indisponivel", divergencia: true });
      continue;
    }
    const json = await resposta.json().catch(() => ({}));
    const tipo = eventoDeConsulta(json.status);
    if (!resposta.ok || !tipo) {
      resultados.push({ txid: cobranca.txid, resultado: "sem_evento_novo", divergencia: !resposta.ok });
      continue;
    }
    const evento = `consulta:${cobranca.cobranca_externa}:${tipo}`;
    const registrado = await admin.rpc("receber_evento_asaas", {
      evento_externo: evento,
      tipo,
      cobranca_externa: cobranca.cobranca_externa,
      valor_recebido: json.value ?? null,
      taxa_recebida: taxaDe(json),
      liquido_recebido: json.netValue ?? null,
    });
    if (registrado.error || registrado.data?.repetir) {
      resultados.push({ txid: cobranca.txid, resultado: "falhou", divergencia: true });
      continue;
    }
    if (!registrado.data?.processar) {
      resultados.push({ txid: cobranca.txid, resultado: registrado.data?.resultado || "repetido", divergencia: false });
      continue;
    }
    const processado = await admin.rpc("processar_evento_asaas", { evento_externo: evento });
    const resultado = processado.data?.resultado || "falhou";
    resultados.push({
      txid: cobranca.txid,
      resultado,
      divergencia: resultado === "analise" || Boolean(processado.error),
    });
  }
  const plano = planoConciliacao({ destinoOk: true, resultados, cobrancasAbertas: 0 });
  return Response.json(plano.corpo, { status: plano.status });
});
