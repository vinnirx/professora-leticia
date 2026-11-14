import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migracao-pagamentos.sql", import.meta.url), "utf8");

assert.equal(sql.includes("insert into public.direitos_acesso (usuario_id, atividade_id, txid, origem)\nselect distinct usuario_id, atividade_id, txid, 'compra'\nfrom public.pedidos\nwhere status = 'pago'\non conflict"), false);
assert.match(sql, /confirmacao is null/);
const corpoBaixar = sql.slice(sql.indexOf("function public.pode_baixar"), sql.indexOf("function public.preparar_cobranca"));
assert.match(corpoBaixar, /pedido\.legado/);
assert.match(corpoBaixar, /controle\.aberta/);
assert.match(sql, /grant select \([\s\S]*status[\s\S]*\) on public\.cobrancas to authenticated/);
assert.doesNotMatch(sql.slice(sql.indexOf("grant select ("), sql.indexOf(") on public.cobrancas")), /copia_cola/);
assert.doesNotMatch(sql, /create policy "admin le atividade"/);
assert.match(sql, /confirmar is distinct from true/);
assert.match(sql, /auditoria_conciliacao/);
assert.match(sql, /resumo_conciliacao/);
assert.match(sql, /conciliados_sem_direito/);
assert.match(sql, /receber_evento_asaas/);
assert.match(sql, /processar_evento_asaas/);
const bloqueio = readFileSync(new URL("../supabase/migracao-downloads-finais.sql", import.meta.url), "utf8");
assert.match(bloqueio, /admin le atividade/);
assert.match(bloqueio, /A conciliação ainda está aberta/);
assert.match(sql, /PAYMENT_PARTIALLY_REFUNDED/);
assert.match(sql, /pg_advisory_xact_lock/);
assert.match(sql, /confirmacao = 'asaas'/);
assert.match(sql, /confirmacao = 'admin'/);
assert.match(sql, /conciliar_pedido/);
assert.match(sql, /PAYMENT_CONFIRMED não libera/);
assert.match(sql, /auth\.role\(\), ''\) is distinct from 'service_role'/);
assert.match(sql, /centavos_recebidos <> centavos_esperados/);
assert.doesNotMatch(sql, /service_role_key|ASAAS_API_KEY|sb_secret/i);

const download = readFileSync(new URL("../supabase/functions/link-download/index.ts", import.meta.url), "utf8");
assert.match(download, /createSignedUrl\(`\$\{atividade\}\/\$\{nome\}`, 120\)/);
assert.match(download, /pode_baixar/);

const webhook = readFileSync(new URL("../supabase/functions/webhook-asaas/index.ts", import.meta.url), "utf8");
assert.match(webhook, /asaas-access-token/);
assert.match(webhook, /segredosIguais/);
assert.match(webhook, /receber_evento_asaas/);
assert.match(webhook, /processar_evento_asaas/);
assert.doesNotMatch(webhook, /Authorization/);

const cobranca = readFileSync(new URL("../supabase/functions/criar-cobranca/index.ts", import.meta.url), "utf8");
assert.match(cobranca, /preparar_cobranca/);
assert.doesNotMatch(cobranca, /pedido\.valor|pedido\.preco/);
assert.match(cobranca, /ASAAS_AMBIENTE/);
assert.match(cobranca, /AbortSignal\.timeout\(12000\)/);
assert.match(cobranca, /cpfCnpj/);
assert.match(cobranca, /documentoValido/);
assert.match(cobranca, /externalReference=/);
assert.doesNotMatch(cobranca, /console\.log/);

console.log("ok migração e funções sem concessão automática");
