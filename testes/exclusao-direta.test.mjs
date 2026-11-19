import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const dona = "11111111-1111-4111-8111-111111111111";
const gestor = "22222222-2222-4222-8222-222222222222";
const cliente = "33333333-3333-4333-8333-333333333333";
const sessaoDona = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sessaoGestor = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sessaoCliente = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const db = new PGlite();
const arquivo = (nome) => readFileSync(new URL(`../supabase/${nome}`, import.meta.url), "utf8");
const proposta = arquivo("migracao-exclusao-direta.sql");
const reversao = arquivo("reverter-exclusao-direta.sql");

assert.doesNotMatch(proposta, /storage\.objects|delete from storage/);
assert.doesNotMatch(proposta, /grant execute on function public\.apagar_atividade_sem_venda\(text\) to anon/);
assert.doesNotMatch(proposta, /disable row level security|arquivada_em is null/);
assert.match(proposta, /motivo_dona_atividade\(\)/);
assert.match(reversao, /arquivada_em is null/);

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  end $$;
  create schema if not exists auth;
  create table auth.sessions (
    id uuid primary key,
    user_id uuid not null,
    not_after timestamptz
  );
  create or replace function auth.jwt() returns jsonb
  language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true), '')::jsonb
  $$;
  create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;
  create table public.perfis (
    id uuid primary key,
    papel text not null,
    acesso_financeiro boolean not null default false
  );
  create table public.proprietaria (
    id integer primary key,
    usuario_id uuid not null
  );
  create or replace function public.id_proprietaria()
  returns uuid language sql stable as $$
    select usuario_id from public.proprietaria where id = 1
  $$;
  create table public.atividades (
    id text primary key,
    titulo text not null,
    preco numeric(10, 2) not null,
    arquivo text not null,
    capa text not null default ''
  );
  create table public.pedidos (
    id uuid primary key default gen_random_uuid(),
    usuario_id uuid not null references public.perfis (id),
    atividade_id text not null references public.atividades (id),
    titulo text not null,
    valor numeric(10, 2) not null,
    txid text not null,
    status text not null default 'aguardando'
  );
  create table public.direitos_acesso (
    usuario_id uuid not null references public.perfis (id),
    atividade_id text not null references public.atividades (id),
    primary key (usuario_id, atividade_id)
  );
  create table public.cobrancas (
    id uuid primary key default gen_random_uuid(),
    txid text not null,
    valor_bruto numeric(10, 2) not null
  );
  insert into public.perfis (id, papel) values
    ('${dona}', 'owner'),
    ('${gestor}', 'admin'),
    ('${cliente}', 'cliente');
  insert into public.proprietaria (id, usuario_id) values (1, '${dona}');
  insert into auth.sessions (id, user_id) values
    ('${sessaoDona}', '${dona}'),
    ('${sessaoGestor}', '${gestor}'),
    ('${sessaoCliente}', '${cliente}');
  insert into public.atividades (id, titulo, preco, arquivo, capa) values
    ('publicada-limpa', 'Publicada limpa', 10.00, 'exclusivo.pdf', 'capa-exclusiva.png'),
    ('fora-da-vitrine', 'Fora da vitrine', 10.00, 'fora.pdf', ''),
    ('vendida', 'Vendida', 9.90, 'comprado.pdf', 'capa-comprada.png'),
    ('compartilha', 'Compartilha arquivo', 5.00, 'exclusivo.pdf', 'capa-exclusiva.png');
  insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid, status)
  values ('${cliente}', 'vendida', 'Vendida', 9.90, 'PEDIDO-FICTICIO', 'pago');
  insert into public.direitos_acesso (usuario_id, atividade_id)
  values ('${cliente}', 'vendida');
  insert into public.cobrancas (txid, valor_bruto) values ('PEDIDO-FICTICIO', 9.90);
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant execute on function auth.jwt() to anon, authenticated;
`);

await db.exec(arquivo("migracao-sessao-ativa.sql"));
await db.exec(arquivo("migracao-aal2-admin.sql"));
await db.exec(arquivo("migracao-arquivar-atividade.sql"));
await db.exec(arquivo("migracao-aal1-catalogo.sql"));
await db.exec("update public.atividades set arquivada_em = now() where id = 'fora-da-vitrine'");
await db.exec(proposta);

async function entrar({ sub, aal, session_id }) {
  const claims = JSON.stringify({ sub, aal, session_id }).replaceAll("'", "''");
  await db.exec(`select set_config('request.jwt.claims', '${claims}', false)`);
}

async function chamar(atividade) {
  const resultado = await db.query(`select public.apagar_atividade_sem_venda('${atividade}') as resultado`);
  return resultado.rows[0].resultado;
}

async function existe(id) {
  const resultado = await db.query(`select count(*)::int as total from public.atividades where id = '${id}'`);
  return resultado.rows[0].total;
}

await entrar({ sub: dona, aal: "aal1", session_id: sessaoDona });
assert.equal((await chamar("publicada-limpa")).ok, true);
assert.equal(await existe("publicada-limpa"), 0);
assert.equal(await existe("compartilha"), 1);
const arquivoRestante = await db.query("select arquivo, capa from public.atividades where id = 'compartilha'");
assert.equal(arquivoRestante.rows[0].arquivo, "exclusivo.pdf");
assert.equal(arquivoRestante.rows[0].capa, "capa-exclusiva.png");

assert.equal((await chamar("fora-da-vitrine")).ok, true);
assert.equal(await existe("fora-da-vitrine"), 0);

const bloqueio = await chamar("vendida");
assert.equal(bloqueio.ok, false);
assert.match(bloqueio.mensagem, /venda, cobrança ou download/);
assert.equal(await existe("vendida"), 1);
assert.equal((await db.query("select count(*)::int as total from public.pedidos")).rows[0].total, 1);
assert.equal((await db.query("select count(*)::int as total from public.direitos_acesso")).rows[0].total, 1);
assert.equal((await db.query("select count(*)::int as total from public.cobrancas")).rows[0].total, 1);
assert.equal((await db.query("select arquivo from public.atividades where id = 'vendida'")).rows[0].arquivo, "comprado.pdf");

await entrar({ sub: gestor, aal: "aal1", session_id: sessaoGestor });
assert.match((await chamar("compartilha")).mensagem, /proprietária/);
assert.equal(await existe("compartilha"), 1);

await entrar({ sub: cliente, aal: "aal1", session_id: sessaoCliente });
assert.match((await chamar("compartilha")).mensagem, /proprietária/);
assert.equal(await existe("compartilha"), 1);

await db.exec("select set_config('request.jwt.claims', '', false)");
await db.exec("set role anon");
await assert.rejects(() => db.query("select public.apagar_atividade_sem_venda('compartilha')"), /permission denied/);
await db.exec("reset role");

await db.exec(reversao);
await entrar({ sub: dona, aal: "aal1", session_id: sessaoDona });
const antiga = await chamar("compartilha");
assert.equal(antiga.ok, false);
assert.match(antiga.mensagem, /Arquive/);
assert.equal(await existe("compartilha"), 1);

console.log("ok exclusão direta");
