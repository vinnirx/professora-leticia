import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const dona = "11111111-1111-4111-8111-111111111111";
const admin = "22222222-2222-4222-8222-222222222222";
const cliente = "33333333-3333-4333-8333-333333333333";
const sessaoDona = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sessaoAdmin = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sessaoCliente = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const sessaoAntiga = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const db = new PGlite();
const arquivo = readFileSync(new URL("../supabase/migracao-sessao-ativa.sql", import.meta.url), "utf8");

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
  insert into auth.sessions (id, user_id) values
    ('${sessaoDona}', '${dona}'),
    ('${sessaoAdmin}', '${admin}'),
    ('${sessaoCliente}', '${cliente}');
  create or replace function auth.jwt() returns jsonb
  language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true), '')::jsonb
  $$;
  create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;
  create table public.pedidos (
    id uuid primary key default gen_random_uuid(),
    titulo text not null
  );
  insert into public.pedidos (titulo) values ('Compra antiga');
`);

await db.exec(arquivo);

async function ativa(claims) {
  await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify(claims)}', false)`);
  const resultado = await db.query("select public.sessao_ainda_valida() as ativa");
  return resultado.rows[0].ativa;
}

assert.equal(await ativa({ sub: cliente, aal: "aal1", session_id: sessaoCliente }), true);
assert.equal(await ativa({ sub: admin, aal: "aal1", session_id: sessaoAdmin }), true);
assert.equal(await ativa({ sub: dona, aal: "aal2", session_id: sessaoDona }), true);
assert.equal(await ativa({ sub: dona, aal: "aal1", session_id: sessaoAntiga }), false);
assert.equal(await ativa({ sub: cliente, aal: "aal1", session_id: sessaoDona }), false);
assert.equal(await ativa({ sub: dona, aal: "aal2" }), false);
await db.exec(`update auth.sessions set not_after = now() - interval '1 minute' where id = '${sessaoCliente}'`);
assert.equal(await ativa({ sub: cliente, aal: "aal1", session_id: sessaoCliente }), false);
await db.exec(`update auth.sessions set not_after = now() + interval '1 hour' where id = '${sessaoCliente}'`);
assert.equal(await ativa({ sub: cliente, aal: "aal1", session_id: sessaoCliente }), true);
await db.exec(`update auth.sessions set not_after = null where id = '${sessaoCliente}'`);
assert.equal(await ativa({ aal: "aal1", session_id: sessaoDona }), false);

await db.exec(`delete from auth.sessions where id = '${sessaoAdmin}'`);
assert.equal(await ativa({ sub: admin, aal: "aal2", session_id: sessaoAdmin }), false);
assert.equal((await db.query("select count(*)::int as total from public.pedidos")).rows[0].total, 1);

const privilegio = await db.query(`
  select
    has_function_privilege('anon', 'public.sessao_ainda_valida()', 'execute') as anon,
    has_function_privilege('authenticated', 'public.sessao_ainda_valida()', 'execute') as autenticada
`);
assert.equal(privilegio.rows[0].anon, false);
assert.equal(privilegio.rows[0].autenticada, true);

await db.exec(readFileSync(new URL("../supabase/reverter-sessao-ativa.sql", import.meta.url), "utf8"));
const removida = await db.query("select to_regprocedure('public.sessao_ainda_valida()') as nome");
assert.equal(removida.rows[0].nome, null);

console.log("ok sessão ativa isolada");
