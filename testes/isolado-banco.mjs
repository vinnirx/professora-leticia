import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const dona = "11111111-1111-4111-8111-111111111111";
const superId = "22222222-2222-4222-8222-222222222222";
const adminId = "33333333-3333-4333-8333-333333333333";
const pagoId = "44444444-4444-4444-8444-444444444444";
const pendenteId = "55555555-5555-4555-8555-555555555555";
const vazioId = "66666666-6666-4666-8666-666666666666";

const db = new PGlite();
const arquivo = (nome) => readFileSync(new URL(`../supabase/${nome}`, import.meta.url), "utf8");

async function sql(texto) {
  return db.exec(texto);
}

async function linhas(texto) {
  const resultado = await db.query(texto);
  return resultado.rows;
}

async function um(texto) {
  const rows = await linhas(texto);
  return rows[0];
}

async function falha(texto) {
  try {
    await sql(texto);
  } catch (erro) {
    return String(erro.message || erro);
  }
  throw new Error(`deveria falhar: ${texto.slice(0, 80)}`);
}

async function como(papel, id) {
  await sql("reset role");
  await sql(`select set_config('request.jwt.claim.sub', '${id || ""}', false)`);
  await sql(`select set_config('request.jwt.claim.role', '${papel}', false)`);
  await sql(`select set_config('request.jwt.claim.iat', '${Math.floor(Date.now() / 1000)}', false)`);
  if (papel !== "postgres") await sql(`set role ${papel}`);
}

function usuario(id, email) {
  return `insert into auth.users (id, email, created_at, raw_user_meta_data)
    values ('${id}', '${email}', now(), '{"nome":"Teste"}'::jsonb);`;
}

await sql(`
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key,
    email text not null,
    created_at timestamptz not null default now(),
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create or replace function auth.role() returns text
  language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
  $$;
  create or replace function auth.jwt() returns jsonb
  language sql stable as $$
    select jsonb_build_object(
      'role', auth.role(),
      'iat', nullif(current_setting('request.jwt.claim.iat', true), '')
    )
  $$;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema if not exists storage;
  create table if not exists storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false
  );
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null,
    name text not null
  );
  alter table storage.objects enable row level security;
`);

const eu = (await um("select current_user as nome")).nome;
await sql(`grant anon, authenticated, service_role to "${eu.replaceAll('"', "")}"`);

await sql(arquivo("esquema.sql"));
await sql(`
  ${usuario(dona, "leticiapimenteldemacedo@gmail.com")}
  ${usuario(superId, "super.teste@example.com")}
  ${usuario(adminId, "admin.teste@example.com")}
  ${usuario(pagoId, "cliente.pago@example.com")}
  ${usuario(pendenteId, "cliente.pendente@example.com")}
  ${usuario(vazioId, "cliente.vazio@example.com")}
  insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid, status)
  values ('${pagoId}', 'adicao', 'Adição', 9.90, 'legado001', 'pago');
`);
await sql(arquivo("migracao-permissoes.sql"));
await sql(arquivo("migracao-pagamentos.sql"));
await sql(`
  grant usage on schema storage to anon, authenticated, service_role;
  grant select on storage.objects to anon, authenticated, service_role;
  insert into storage.objects (bucket_id, name)
  values
    ('atividades', 'adicao/situacoes-problema-adicao.pdf'),
    ('atividades', 'silabas/infografico-separacao-de-silabas.pdf');
`);

const legado = await um(`select legado, confirmacao from public.pedidos where txid = 'legado001'`);
assert.equal(legado.legado, true);
assert.equal(legado.confirmacao, null);

await como("authenticated", dona);
const viraSuper = await um(`select public.definir_papel('${superId}', 'super_admin') as resultado`);
assert.equal(viraSuper.resultado.ok, true);
const viraAdmin = await um(`select public.definir_papel('${adminId}', 'admin') as resultado`);
assert.equal(viraAdmin.resultado.ok, true);

await como("authenticated", superId);
const superMexeDona = await um(`select public.definir_papel('${dona}', 'admin') as resultado`);
assert.equal(superMexeDona.resultado.ok, false);
assert.match(superMexeDona.resultado.mensagem, /proprietária/i);
const superCriaSuper = await um(`select public.definir_papel('${adminId}', 'super_admin') as resultado`);
assert.equal(superCriaSuper.resultado.ok, false);

await como("authenticated", adminId);
const adminCriaSuper = await um(`select public.definir_papel('${pagoId}', 'super_admin') as resultado`);
assert.equal(adminCriaSuper.resultado.ok, false);

await como("authenticated", pagoId);
const clienteMexeCargo = await um(`select public.definir_papel('${vazioId}', 'admin') as resultado`);
assert.equal(clienteMexeCargo.resultado.ok, false);
assert.match(await falha(`update public.perfis set papel = 'owner' where id = '${vazioId}'`), /permission denied|permissão/i);
assert.match(await falha(`update public.pedidos set status = 'pago' where txid = 'legado001'`), /permission denied|permissão/i);
assert.match(await falha("select copia_cola from public.cobrancas"), /permission denied|permissão/i);
assert.match(await falha("select public.conciliar_pedido('legado001', true)"), /Sem permissão/);

await como("postgres", "");
assert.match(await falha("select public.conciliar_pedido('legado001', true)"), /Sem permissão/);

await como("authenticated", adminId);
assert.match(await falha("select public.listar_conciliacao()"), /Sem permissão/);
await como("authenticated", superId);
assert.match(await falha("select public.conciliar_pedido('legado001', true)"), /Sem permissão/);

await como("authenticated", dona);
const semConfirmar = await um("select public.conciliar_pedido('legado001', false) as resultado");
assert.equal(semConfirmar.resultado.ok, false);
await como("postgres", "");
assert.equal(Number((await um("select count(*)::int as total from public.auditoria_conciliacao")).total), 0);
assert.equal((await um("select confirmacao from public.pedidos where txid = 'legado001'")).confirmacao, null);

await como("authenticated", vazioId);
assert.equal(Boolean((await um("select public.pode_baixar('adicao') as ok")).ok), false);
assert.equal(Number((await um("select count(*)::int as total from storage.objects")).total), 0);

await sql("reset role");
await sql(`
  insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid, status)
  values ('${pendenteId}', 'adicao', 'Adição', 9.90, 'pendente1', 'aguardando');
`);
await como("authenticated", pendenteId);
assert.equal(Boolean((await um("select public.pode_baixar('adicao') as ok")).ok), false);
assert.equal(Number((await um("select count(*)::int as total from storage.objects")).total), 0);

await como("authenticated", pagoId);
assert.equal(Boolean((await um("select public.pode_baixar('adicao') as ok")).ok), true);
assert.equal(Boolean((await um("select public.pode_baixar('silabas') as ok")).ok), false);
const arquivosPagos = await linhas("select name from storage.objects order by name");
assert.deepEqual(arquivosPagos.map((item) => item.name), ["adicao/situacoes-problema-adicao.pdf"]);

await como("authenticated", dona);
const conciliado = await um("select public.conciliar_pedido('legado001', true) as resultado");
assert.equal(conciliado.resultado.ok, true);
await como("postgres", "");
const auditoria = await um("select conciliado_por, txid, quantidade from public.auditoria_conciliacao");
assert.equal(auditoria.conciliado_por, dona);
assert.equal(auditoria.txid, "legado001");
assert.equal(Number(auditoria.quantidade), 1);
assert.equal(Number((await um(`select count(*)::int as total from public.direitos_acesso where usuario_id = '${pagoId}' and revogado_em is null`)).total), 1);

await como("authenticated", pagoId);
assert.equal(Boolean((await um("select public.pode_baixar('adicao') as ok")).ok), true);

await sql("reset role");
await sql(`
  insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid, status, legado)
  values ('${pagoId}', 'silabas', 'Sílabas', 4.90, 'legado002', 'pago', true);
`);
await como("authenticated", dona);
const cedo = await um("select public.encerrar_conciliacao() as resultado");
assert.equal(cedo.resultado.ok, false);
await sql("reset role");
assert.match(await falha(arquivo("migracao-downloads-finais.sql")), /conciliação ainda está aberta/i);
const fechado = await (async () => {
  await como("authenticated", dona);
  await sql("select public.conciliar_pedido('legado002', true)");
  return um("select public.encerrar_conciliacao() as resultado");
})();
assert.equal(fechado.resultado.ok, true);

await sql("reset role");
await sql(`
  insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid, status, legado)
  values ('${vazioId}', 'celulas', 'Células', 4.90, 'legado003', 'pago', true);
`);
await como("authenticated", vazioId);
assert.equal(Boolean((await um("select public.pode_baixar('celulas') as ok")).ok), false);

await sql("reset role");
await sql("delete from public.pedidos where txid = 'legado003'");
await sql(arquivo("migracao-downloads-finais.sql"));
await como("authenticated", pagoId);
assert.equal(Number((await um("select count(*)::int as total from storage.objects")).total), 0);
await como("authenticated", adminId);
assert.equal(Number((await um("select count(*)::int as total from storage.objects")).total), 2);

await sql("reset role");
await sql(`
  insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid, status)
  values
    ('${pagoId}', 'adicao', 'Adição', 9.90, 'novo12345', 'aguardando'),
    ('${pagoId}', 'celulas', 'Células', 4.90, 'novo12345', 'aguardando');
  insert into public.cobrancas (usuario_id, txid, chave_idempotencia, cobranca_externa, valor_bruto, status)
  values ('${pagoId}', 'novo12345', 'chave-nova', 'pay_nova', 14.80, 'pendente');
  insert into public.cobrancas (usuario_id, txid, chave_idempotencia, cobranca_externa, valor_bruto, status)
  values ('${pagoId}', 'valor9999', 'chave-valor', 'pay_valor', 9.90, 'pendente');
  insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid, status)
  values ('${pagoId}', 'celulas', 'Células', 4.90, 'valor9999', 'aguardando');
`);

async function evento(id, tipo, cobranca, valor, liquido) {
  await como("service_role", "");
  const recebido = await um(`
    select public.receber_evento_asaas('${id}', '${tipo}', '${cobranca}', ${valor}, ${liquido == null ? "null" : Number((valor - liquido).toFixed(2))}, ${liquido ?? "null"}) as resultado
  `);
  if (!recebido.resultado.processar) return recebido.resultado;
  const processado = await um(`select public.processar_evento_asaas('${id}') as resultado`);
  return processado.resultado;
}

await como("authenticated", pagoId);
assert.match(await falha("select public.receber_evento_asaas('evt_cliente', 'PAYMENT_RECEIVED', 'pay_nova', 14.80, 1.99, 12.81)"), /Sem permissão|permission denied/i);

const desconhecido = await evento("evt_ausente", "PAYMENT_RECEIVED", "pay_inexistente", 14.8, 12.81);
assert.equal(desconhecido.repetir, true);
await sql("reset role");
assert.equal(Number((await um("select count(*)::int as total from public.eventos_pagamento where evento_externo = 'evt_ausente'")).total), 0);

const confirmado = await evento("evt_confirmado", "PAYMENT_CONFIRMED", "pay_nova", 14.8, 12.81);
assert.equal(confirmado.resultado, "confirmado_sem_liberar");
await sql("reset role");
assert.equal((await um("select status from public.pedidos where txid = 'novo12345' limit 1")).status, "aguardando");

const divergente = await evento("evt_valor", "PAYMENT_RECEIVED", "pay_valor", 1, 0.5);
assert.equal(divergente.resultado, "analise");
await sql("reset role");
assert.equal(Number((await um(`select count(*)::int as total from public.direitos_acesso where txid = 'valor9999'`)).total), 0);

const recebido = await evento("evt_pago", "PAYMENT_RECEIVED", "pay_nova", 14.8, 12.81);
assert.equal(recebido.resultado, "pago");
const repetido = await evento("evt_pago", "PAYMENT_RECEIVED", "pay_nova", 14.8, 12.81);
assert.equal(repetido.repetido, true);
await sql("reset role");
assert.equal(Number((await um(`select count(*)::int as total from public.direitos_acesso where usuario_id = '${pagoId}' and txid = 'novo12345' and revogado_em is null`)).total), 2);
const cobranca = await um("select taxa, valor_liquido, status from public.cobrancas where cobranca_externa = 'pay_nova'");
assert.equal(Number(cobranca.taxa), 1.99);
assert.equal(Number(cobranca.valor_liquido), 12.81);
assert.equal(cobranca.status, "pago");

await sql("reset role");
await sql(`
  insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid, status, confirmacao)
  values ('${pagoId}', 'adicao', 'Adição', 9.90, 'outra1234', 'pago', 'admin');
  insert into public.direitos_acesso (usuario_id, atividade_id, txid, origem)
  values ('${pagoId}', 'adicao', 'outra1234', 'compra')
  on conflict (usuario_id, atividade_id) do update
  set txid = excluded.txid, revogado_em = null;
`);
const parcial = await evento("evt_parcial", "PAYMENT_PARTIALLY_REFUNDED", "pay_nova", 14.8, 12.81);
assert.equal(parcial.resultado, "analise");
await sql("reset role");
assert.equal((await um(`select revogado_em is null as ativo from public.direitos_acesso where usuario_id = '${pagoId}' and atividade_id = 'celulas'`)).ativo, true);

const estorno = await evento("evt_estorno", "PAYMENT_REFUNDED", "pay_nova", 14.8, 12.81);
assert.equal(estorno.resultado, "estornada");
await sql("reset role");
assert.equal((await um(`select revogado_em is null as ativo from public.direitos_acesso where usuario_id = '${pagoId}' and atividade_id = 'adicao'`)).ativo, true);
assert.equal((await um(`select revogado_em is null as ativo from public.direitos_acesso where usuario_id = '${pagoId}' and atividade_id = 'celulas'`)).ativo, false);

await sql("reset role");
await sql(`
  insert into public.cobrancas (usuario_id, txid, chave_idempotencia, cobranca_externa, valor_bruto, status)
  values ('${vazioId}', 'ordem1234', 'chave-ordem', 'pay_ordem', 4.90, 'pendente');
  insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid, status)
  values ('${vazioId}', 'celulas', 'Células', 4.90, 'ordem1234', 'aguardando');
`);
const estornoCedo = await evento("evt_cedo", "PAYMENT_REFUNDED", "pay_ordem", 4.9, 2.91);
assert.equal(estornoCedo.resultado, "analise");
const depois = await evento("evt_depois", "PAYMENT_RECEIVED", "pay_ordem", 4.9, 2.91);
assert.equal(depois.resultado, "analise");
await sql("reset role");
assert.equal(Number((await um(`select count(*)::int as total from public.direitos_acesso where usuario_id = '${vazioId}'`)).total), 0);

console.log("ok banco isolado com usuários fictícios");
await db.close();
