import { createClient } from "jsr:@supabase/supabase-js@2";
import { cabecalhos, responder } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const origem = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cabecalhos(origem) });
  if (req.method !== "POST") return responder(origem, 405, { ok: false, mensagem: "Método não aceito." });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviço = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !anon || !serviço) return responder(origem, 503, { ok: false, mensagem: "Download protegido indisponível." });

  const autorizacao = req.headers.get("Authorization") || "";
  const usuario = createClient(url, anon, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  });
  const { data: conta, error: erroConta } = await usuario.auth.getUser();
  if (erroConta || !conta.user) return responder(origem, 401, { ok: false, mensagem: "Entre na conta para baixar." });

  const pedido = await req.json().catch(() => null);
  const atividade = String(pedido?.atividade || "");
  if (!/^[a-z0-9-]{1,48}$/.test(atividade)) return responder(origem, 400, { ok: false, mensagem: "Atividade inválida." });

  const { data: permitido, error: erroPermissao } = await usuario.rpc("pode_baixar", { atividade });
  if (erroPermissao || permitido !== true) return responder(origem, 403, { ok: false, mensagem: "Este material ainda não está liberado." });

  const { data: cadastro, error: erroCadastro } = await usuario.from("atividades").select("arquivo").eq("id", atividade).maybeSingle();
  const nome = String(cadastro?.arquivo || "");
  if (erroCadastro || !/^[A-Za-z0-9._-]{1,180}$/.test(nome)) {
    return responder(origem, 404, { ok: false, mensagem: "Arquivo não encontrado." });
  }

  const admin = createClient(url, serviço, { auth: { persistSession: false } });
  const { data: link, error: erroLink } = await admin.storage
    .from("atividades")
    .createSignedUrl(`${atividade}/${nome}`, 120);
  if (erroLink || !link?.signedUrl) return responder(origem, 404, { ok: false, mensagem: "Arquivo não encontrado." });
  return responder(origem, 200, { ok: true, url: link.signedUrl, expiraEm: 120 });
});
