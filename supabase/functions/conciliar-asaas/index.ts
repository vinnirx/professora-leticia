import { createClient } from "jsr:@supabase/supabase-js@2";
import { segredosIguais, situacaoAsaas } from "../_shared/regras.mjs";

const sandbox = "https://api-sandbox.asaas.com/v3";
const producao = "https://api.asaas.com/v3";

function baseAsaas() {
  const ambiente = Deno.env.get("ASAAS_AMBIENTE") || "";
  if (ambiente === "sandbox") return sandbox;
  if (ambiente === "producao" && Deno.env.get("ASAAS_PRODUCAO_LIBERADA") === "sim") return producao;
  return "";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Método não aceito", { status: 405 });
  const esperado = Deno.env.get("CONCILIACAO_TOKEN") || "";
  const recebido = req.headers.get("x-conciliacao-token") || "";
  if (!esperado || !segredosIguais(recebido, esperado)) return new Response("Não autorizado", { status: 401 });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviço = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const chaveAsaas = Deno.env.get("ASAAS_API_KEY") || "";
  const base = baseAsaas();
  if (!url || !serviço || !chaveAsaas || !base) return new Response("Não configurado", { status: 503 });

  const pedido = await req.json().catch(() => ({}));
  const txid = String(pedido?.txid || "");
  const admin = createClient(url, serviço, { auth: { persistSession: false } });
  let consulta = admin.from("cobrancas").select("id, txid, usuario_id, valor_bruto, status, cobranca_externa").in("status", ["criada", "pendente"]).not("cobranca_externa", "is", null).limit(20);
  if (txid) consulta = admin.from("cobrancas").select("id, txid, usuario_id, valor_bruto, status, cobranca_externa").eq("txid", txid).limit(1);
  const { data: cobrancas, error } = await consulta;
  if (error) return new Response("Falha ao ler cobranças", { status: 500 });

  const resultados = [];
  for (const cobranca of cobrancas || []) {
    if (!cobranca.cobranca_externa) continue;
    const resposta = await fetch(`${base}/payments/${cobranca.cobranca_externa}`, {
      headers: { access_token: chaveAsaas },
      signal: AbortSignal.timeout(12000),
    });
    const json = await resposta.json().catch(() => ({}));
    const decisao = situacaoAsaas({
      statusCobranca: cobranca.status,
      statusGateway: json.status,
      valorEsperado: cobranca.valor_bruto,
      valorGateway: json.value,
    });
    if (!decisao.liberar) {
      resultados.push({ txid: cobranca.txid, resultado: decisao.resultado });
      continue;
    }
    const evento = `consulta:${cobranca.cobranca_externa}:RECEIVED`;
    const taxa = json.value != null && json.netValue != null ? Number((Number(json.value) - Number(json.netValue)).toFixed(2)) : null;
    const registrado = await admin.rpc("receber_evento_asaas", {
      evento_externo: evento,
      tipo: "PAYMENT_RECEIVED",
      cobranca_externa: cobranca.cobranca_externa,
      valor_recebido: json.value ?? null,
      taxa_recebida: taxa,
      liquido_recebido: json.netValue ?? null,
    });
    if (registrado.error || !registrado.data?.processar) {
      resultados.push({ txid: cobranca.txid, resultado: registrado.data?.resultado || "repetido" });
      continue;
    }
    const processado = await admin.rpc("processar_evento_asaas", { evento_externo: evento });
    resultados.push({ txid: cobranca.txid, resultado: processado.data?.resultado || "falhou" });
  }
  return Response.json({ ok: true, resultados });
});
