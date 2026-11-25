import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

import { eventoAceito, segredosIguais } from "../supabase/functions/_shared/regras.mjs";

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const webhook = ler("../supabase/functions/webhook-asaas/index.ts");
const pagamentos = ler("../supabase/migracao-pagamentos.sql");

function trecho(sql, inicio, fim) {
  const de = sql.indexOf(inicio);
  const ate = sql.indexOf(fim, de + inicio.length);
  assert.ok(de >= 0 && ate > de, inicio);
  return sql.slice(de, ate);
}

const porta = webhook.indexOf("if (!eventoAceito(evento))");
const gravacao = webhook.indexOf("receber_evento_asaas");
assert.ok(porta > 0 && porta < gravacao);
assert.match(webhook, /new Response\("Evento incompleto", \{ status: 400 \}\)/);
assert.match(webhook, /asaas-access-token/);
assert.match(webhook, /segredosIguais/);
assert.match(webhook, /processar_evento_asaas/);
assert.match(webhook, /Falha ao processar/);
assert.match(webhook, /Ainda não/);
assert.doesNotMatch(webhook, /waitUntil|console\.(log|error|info|debug)|Authorization/);

const valido = { id: "evt_pago_1", event: "PAYMENT_RECEIVED", payment: { id: "pay_loja" } };
assert.equal(eventoAceito(valido), true);
assert.equal(eventoAceito({ id: "evt_pago_1", payment: { id: "pay_loja" } }), false);
assert.equal(eventoAceito({ id: "evt_pago_1", event: "", payment: { id: "pay_loja" } }), false);
assert.equal(eventoAceito({ id: "evt_pago_1", event: "   ", payment: { id: "pay_loja" } }), false);
assert.equal(eventoAceito({ id: "evt_pago_1", event: "PAYMENT_RECEIVED" }), false);
assert.equal(eventoAceito({ id: "evt_pago_1", event: "PAYMENT_RECEIVED", payment: { id: "" } }), false);
assert.equal(eventoAceito({ id: "evt_pago_1", event: "PAYMENT_RECEIVED", payment: { id: "  " } }), false);
assert.equal(eventoAceito(null), false);
assert.equal(segredosIguais("token-errado", "token-certo"), false);
assert.equal(segredosIguais("", "token-certo"), false);
assert.equal(segredosIguais("token-certo", "token-certo"), true);

const cliente = "44444444-4444-4444-8444-444444444444";
const db = new PGlite();

async function sql(texto) {
  return db.exec(texto);
}

async function um(texto) {
  return (await db.query(texto)).rows[0];
}

await sql(`
  create schema if not exists auth;
  create or replace function auth.role() returns text
  language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
  $$;
  create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create table public.atividades (
    id text primary key,
    titulo text not null,
    preco numeric(10, 2) not null check (preco > 0),
    arquivo text not null default 'material.pdf'
  );
  create table public.pedidos (
    id uuid primary key default gen_random_uuid(),
    usuario_id uuid not null,
    atividade_id text not null,
    titulo text not null,
    valor numeric(10, 2) not null check (valor > 0),
    txid text not null,
    status text not null default 'aguardando',
    confirmacao text
  );
  create table public.cobrancas (
    id uuid primary key default gen_random_uuid(),
    usuario_id uuid not null,
    txid text not null,
    chave_idempotencia text not null unique,
    provedor text not null default 'asaas',
    cobranca_externa text,
    valor_bruto numeric(10, 2) not null check (valor_bruto > 0),
    taxa numeric(10, 2),
    valor_liquido numeric(10, 2),
    status text not null default 'pendente',
    copia_cola text,
    expira_em timestamptz,
    atualizado_em timestamptz
  );
  create table public.direitos_acesso (
    usuario_id uuid not null,
    atividade_id text not null,
    txid text not null,
    origem text not null,
    revogado_em timestamptz,
    concedido_em timestamptz not null default now(),
    primary key (usuario_id, atividade_id)
  );
  create table public.eventos_pagamento (
    id uuid primary key default gen_random_uuid(),
    evento_externo text not null unique,
    cobranca_id uuid,
    tipo text not null,
    valor numeric(10, 2),
    resultado text not null,
    detalhe text not null default '',
    taxa numeric(10, 2),
    liquido numeric(10, 2),
    recebido_em timestamptz not null default now()
  );
  insert into public.atividades (id, titulo, preco) values ('adicao', 'Adição', 9.90);
  insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid, status)
  values ('${cliente}', 'adicao', 'Adição', 9.90, 'pedido-valido', 'aguardando');
  insert into public.cobrancas (usuario_id, txid, chave_idempotencia, cobranca_externa, valor_bruto)
  values ('${cliente}', 'pedido-valido', 'chave-valida', 'pay_loja', 9.90);
  insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid, status)
  values ('${cliente}', 'adicao', 'Adição', 9.90, 'pedido-valor', 'aguardando');
  insert into public.cobrancas (usuario_id, txid, chave_idempotencia, cobranca_externa, valor_bruto)
  values ('${cliente}', 'pedido-valor', 'chave-valor', 'pay_valor', 9.90);
  insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid, status, confirmacao)
  values ('${cliente}', 'adicao', 'Adição', 4.90, '9d2daf094d', 'pago', 'asaas');
  insert into public.direitos_acesso (usuario_id, atividade_id, txid, origem)
  values ('${cliente}', 'adicao', '9d2daf094d', 'compra');
`);
await sql(trecho(pagamentos, "create or replace function public.receber_evento_asaas", "create or replace function public.processar_evento_asaas"));
await sql(trecho(pagamentos, "create or replace function public.processar_evento_asaas", "create or replace function public.confirmar_pix"));

async function comoServico() {
  await sql("select set_config('request.jwt.claim.role', 'service_role', false)");
}

async function evento(id, tipo, cobranca, valor, liquido) {
  await comoServico();
  const taxa = liquido == null ? "null" : Number((valor - liquido).toFixed(2));
  const recebido = await um(`
    select public.receber_evento_asaas('${id}', '${tipo}', '${cobranca}', ${valor}, ${taxa}, ${liquido ?? "null"}) as resultado
  `);
  if (!recebido.resultado.processar) return recebido.resultado;
  const processado = await um(`select public.processar_evento_asaas('${id}') as resultado`);
  return processado.resultado;
}

const desconhecido = await evento("evt_ausente", "PAYMENT_RECEIVED", "pay_inexistente", 9.9, 9.11);
assert.equal(desconhecido.repetir, true);
assert.equal(Number((await um("select count(*)::int as total from public.eventos_pagamento where evento_externo = 'evt_ausente'")).total), 0);
assert.equal((await um("select status from public.pedidos where txid = 'pedido-valido'")).status, "aguardando");

const vazioTipo = await evento("evt_sem_tipo", "", "pay_loja", 9.9, 9.11);
assert.notEqual(vazioTipo.resultado, "pago");
assert.equal((await um("select status from public.pedidos where txid = 'pedido-valido'")).status, "aguardando");
assert.equal(Number((await um("select count(*)::int as total from public.direitos_acesso where txid = 'pedido-valido'")).total), 0);

const vazioCobranca = await evento("evt_sem_cobranca", "PAYMENT_RECEIVED", "", 9.9, 9.11);
assert.equal(vazioCobranca.repetir, true);
assert.equal((await um("select status from public.pedidos where txid = 'pedido-valido'")).status, "aguardando");

const divergente = await evento("evt_valor", "PAYMENT_RECEIVED", "pay_valor", 1, 0.5);
assert.equal(divergente.resultado, "analise");
assert.equal((await um("select status from public.pedidos where txid = 'pedido-valor'")).status, "aguardando");
assert.equal(Number((await um("select count(*)::int as total from public.direitos_acesso where txid = 'pedido-valor'")).total), 0);

const confirmado = await evento("evt_confirmado", "PAYMENT_CONFIRMED", "pay_loja", 9.9, 9.11);
assert.equal(confirmado.resultado, "confirmado_sem_liberar");
assert.equal((await um("select status from public.pedidos where txid = 'pedido-valido'")).status, "aguardando");

const pago = await evento("evt_pago_1", "PAYMENT_RECEIVED", "pay_loja", 9.9, 9.11);
assert.equal(pago.resultado, "pago");
const repetido = await evento("evt_pago_1", "PAYMENT_RECEIVED", "pay_loja", 9.9, 9.11);
assert.equal(repetido.repetido, true);
assert.equal((await um("select status, confirmacao from public.pedidos where txid = 'pedido-valido'")).status, "pago");
assert.equal((await um("select confirmacao from public.pedidos where txid = 'pedido-valido'")).confirmacao, "asaas");
assert.equal(Number((await um(`select count(*)::int as total from public.direitos_acesso where usuario_id = '${cliente}' and txid = 'pedido-valido' and revogado_em is null`)).total), 1);
assert.equal((await um("select status, confirmacao from public.pedidos where txid = '9d2daf094d'")).status, "pago");
assert.equal(Number((await um("select valor::numeric as valor from public.pedidos where txid = '9d2daf094d'")).valor), 4.9);

console.log("ok webhook recusa evento incompleto e só libera o PDF com pagamento conferido");
