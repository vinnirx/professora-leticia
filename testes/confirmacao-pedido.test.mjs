import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const confirmada = "11111111-1111-4111-8111-111111111111";
const pendente = "22222222-2222-4222-8222-222222222222";
const db = new PGlite();
const arquivo = (nome) => readFileSync(new URL(`../supabase/${nome}`, import.meta.url), "utf8");

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  end $$;
  create schema if not exists auth;
  create table auth.users (
    id uuid primary key,
    email text not null,
    email_confirmed_at timestamptz
  );
  insert into auth.users (id, email, email_confirmed_at) values
    ('${confirmada}', 'confirmada@exemplo.test', now()),
    ('${pendente}', 'pendente@exemplo.test', null);
  create table public.pedidos (
    id uuid primary key default gen_random_uuid(),
    usuario_id uuid not null,
    atividade_id text not null,
    titulo text not null,
    valor numeric not null,
    txid text not null
  );
  insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid)
    values ('${confirmada}', 'material-antigo', 'Compra antiga', 9.90, 'HISTORICO01');
`);

await db.exec(arquivo("migracao-confirmacao-pedido.sql"));

const historico = (await db.query("select titulo from public.pedidos")).rows;
assert.equal(historico.length, 1);
assert.equal(historico[0].titulo, "Compra antiga");

await db.exec(`
  insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid)
  values ('${confirmada}', 'material-ficticio', 'Título do banco', 4.90, 'NOVOPEDIDO1');
`);
assert.equal((await db.query("select count(*)::int as total from public.pedidos")).rows[0].total, 2);

let bloqueou = false;
try {
  await db.exec(`
    insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid)
    values ('${pendente}', 'material-ficticio', 'Não pode comprar', 4.90, 'BLOQUEADO1');
  `);
} catch (erro) {
  bloqueou = /Confirme o e-mail/.test(String(erro.message || erro));
}
assert.equal(bloqueou, true);
assert.equal((await db.query("select count(*)::int as total from public.pedidos where txid = 'BLOQUEADO1'")).rows[0].total, 0);

await db.exec(arquivo("reverter-confirmacao-pedido.sql"));
await db.exec(`
  insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid)
  values ('${pendente}', 'material-ficticio', 'Depois da reversão', 4.90, 'REVERTIDO1');
`);
assert.equal((await db.query(`select titulo from public.pedidos where usuario_id = '${confirmada}' and txid = 'HISTORICO01'`)).rows[0].titulo, "Compra antiga");

console.log("ok trava de e-mail na compra, isolada");
