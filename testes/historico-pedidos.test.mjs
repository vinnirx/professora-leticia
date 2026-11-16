import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const raiz = new URL("..", import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), "utf8");
const sql = ler("supabase/migracao-visibilidade-pedidos.sql");
const reverter = ler("supabase/reverter-visibilidade-pedidos.sql");
const funcao = ler("supabase/functions/criar-cobranca/index.ts");
const eventos = ler("supabase/migracao-pagamentos.sql");

assert.match(sql, /oculto_em timestamptz/);
assert.match(sql, /auth\.uid\(\)/);
assert.match(sql, /usuario_id = autor/);
assert.match(sql, /status = 'pago'/);
assert.match(sql, /cobranca_externa is not null/);
assert.match(sql, /direitos_acesso/);
assert.match(sql, /eventos_pagamento/);
assert.match(sql, /pg_advisory_xact_lock/);
assert.match(sql, /repetido/);
assert.doesNotMatch(sql, /\bdelete\s+from\b/i);
assert.doesNotMatch(sql, /update public\.direitos_acesso/i);
assert.doesNotMatch(sql, /update public\.eventos_pagamento/i);
assert.match(sql, /revoke all on function public\.cancelar_tentativa_sem_cobranca\(text\) from public, anon, service_role/);
assert.match(sql, /grant execute on function public\.cancelar_tentativa_sem_cobranca\(text\) to authenticated/);
assert.match(reverter, /drop column if exists oculto_em/);
assert.doesNotMatch(reverter, /drop table public\.pedidos/i);

assert.match(sql, /grant select on public\.pedidos to service_role/);
assert.match(sql, /grant select on public\.cobrancas to service_role/);
assert.match(sql, /grant select on public\.direitos_acesso to service_role/);
assert.doesNotMatch(sql, /grant select on public\.pedidos to anon/);
assert.match(funcao, /\.from\("direitos_acesso"\)\s*\.select\("atividade_id"\)/);
assert.doesNotMatch(funcao, /\.from\("direitos_acesso"\)\s*\.select\("id"\)/);
assert.match(funcao, /registro\?\.erro/);
assert.match(funcao, /cancelar_tentativa_sem_cobranca/);
assert.match(funcao, /definir_visibilidade_pedido/);
assert.doesNotMatch(funcao, /method: "DELETE"|asaas\(destino\.base, `\/payments\/\$\{[^`]+\}, chaveAsaas, "DELETE"/);
assert.ok(funcao.indexOf('"cancelar"') < funcao.indexOf("preparar_cobranca"));
assert.doesNotMatch(eventos.slice(eventos.indexOf("function public.processar_evento_asaas"), eventos.indexOf("function public.confirmar_pix")), /oculto_em/);

console.log("ok histórico de pedidos");
