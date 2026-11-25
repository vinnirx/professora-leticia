import { createClient } from "jsr:@supabase/supabase-js@2";
import { eventoAceito, segredosIguais } from "../_shared/regras.mjs";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Método não aceito", { status: 405 });
  const esperado = Deno.env.get("ASAAS_WEBHOOK_TOKEN") || "";
  const recebido = req.headers.get("asaas-access-token") || "";
  if (!esperado || !segredosIguais(recebido, esperado)) return new Response("Não autorizado", { status: 401 });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviço = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviço) return new Response("Não configurado", { status: 503 });

  const evento = await req.json().catch(() => null);
  if (!eventoAceito(evento)) return new Response("Evento incompleto", { status: 400 });

  const pagamento = evento.payment;
  const identificador = String(evento.id).trim();
  const admin = createClient(url, serviço, { auth: { persistSession: false } });
  const taxa = pagamento.value != null && pagamento.netValue != null
    ? Number((Number(pagamento.value) - Number(pagamento.netValue)).toFixed(2))
    : null;
  const { data, error } = await admin.rpc("receber_evento_asaas", {
    evento_externo: identificador,
    tipo: String(evento.event).trim(),
    cobranca_externa: String(pagamento.id).trim(),
    valor_recebido: pagamento.value ?? null,
    taxa_recebida: taxa,
    liquido_recebido: pagamento.netValue ?? null,
  });
  if (error) return new Response("Falha ao registrar", { status: 500 });
  if (data?.repetir) return new Response("Ainda não", { status: 409 });
  if (!data?.processar) {
    return new Response(JSON.stringify({ ok: true, resultado: data?.resultado || "repetido" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  const processado = await admin.rpc("processar_evento_asaas", {
    evento_externo: identificador,
  });
  if (processado.error || processado.data?.repetir) return new Response("Falha ao processar", { status: 500 });
  return new Response(JSON.stringify({ ok: true, resultado: processado.data?.resultado || "repetido" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
