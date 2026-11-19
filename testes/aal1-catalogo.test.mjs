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
const proposta = arquivo("migracao-aal1-catalogo.sql");

assert.doesNotMatch(proposta, /create or replace function public\.(pode_ver_financeiro|definir_papel|definir_financeiro|motivo_proprietaria|estornar)/);
assert.doesNotMatch(proposta, /grant execute on function public\.sou_admin\(\) to anon/);
assert.match(proposta, /sessao_ainda_valida\(\)/);
assert.doesNotMatch(proposta, /->> 'aal'/);

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
  create table public.auditoria_permissoes (
    id uuid primary key default gen_random_uuid(),
    executado_por uuid,
    afetado uuid,
    papel_anterior text,
    papel_novo text,
    operacao text not null,
    resultado text not null,
    detalhe text not null default '',
    criado_em timestamptz not null default now()
  );
  create or replace function public.id_proprietaria()
  returns uuid language sql stable as $$
    select usuario_id from public.proprietaria where id = 1
  $$;
  create table public.atividades (
    id text primary key,
    titulo text not null,
    preco numeric(10, 2) not null,
    arquivo text not null
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
  insert into public.perfis (id, papel) values
    ('${dona}', 'owner'),
    ('${gestor}', 'admin'),
    ('${cliente}', 'cliente');
  insert into public.proprietaria (id, usuario_id) values (1, '${dona}');
  insert into auth.sessions (id, user_id) values
    ('${sessaoDona}', '${dona}'),
    ('${sessaoGestor}', '${gestor}'),
    ('${sessaoCliente}', '${cliente}');
  insert into public.atividades (id, titulo, preco, arquivo) values
    ('material-ficticio', 'Material fictício', 4.90, 'material.pdf'),
    ('sem-venda', 'Sem venda', 4.90, 'sem-venda.pdf');
  insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid)
  values ('${cliente}', 'material-ficticio', 'Material fictício', 4.90, 'PEDIDO-FICTICIO');
  insert into public.direitos_acesso (usuario_id, atividade_id)
  values ('${cliente}', 'material-ficticio');
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant execute on function auth.jwt() to anon, authenticated;
  alter table public.atividades enable row level security;
  alter table public.atividades force row level security;
  grant select on public.atividades to anon, authenticated;
`);

await db.exec(arquivo("migracao-sessao-ativa.sql"));
await db.exec(arquivo("migracao-aal2-admin.sql"));
await db.exec(arquivo("migracao-arquivar-atividade.sql"));
await db.exec(proposta);

async function entrar({ sub, aal, session_id }) {
  const claims = JSON.stringify({ sub, aal, session_id }).replaceAll("'", "''");
  await db.exec(`select set_config('request.jwt.claims', '${claims}', false)`);
}

async function chamar(funcao, atividade) {
  const resultado = await db.query(`select public.${funcao}('${atividade}') as resultado`);
  return resultado.rows[0].resultado;
}

await entrar({ sub: dona, aal: "aal1", session_id: sessaoDona });
assert.equal((await db.query("select public.sou_admin() as ok")).rows[0].ok, true);
assert.equal((await db.query("select public.pode_ver_financeiro() as ok")).rows[0].ok, false);
assert.equal((await chamar("arquivar_atividade", "sem-venda")).ok, true);
assert.equal((await chamar("apagar_atividade_sem_venda", "sem-venda")).ok, true);
assert.equal((await db.query("select count(*)::int as total from public.atividades where id = 'sem-venda'")).rows[0].total, 0);
const vendida = await chamar("arquivar_atividade", "material-ficticio");
assert.equal(vendida.ok, true);
const bloqueio = await chamar("apagar_atividade_sem_venda", "material-ficticio");
assert.equal(bloqueio.ok, false);
assert.match(bloqueio.mensagem, /venda ou download/);
assert.equal((await db.query("select count(*)::int as total from public.atividades where id = 'material-ficticio'")).rows[0].total, 1);
assert.equal((await db.query("select count(*)::int as total from public.pedidos")).rows[0].total, 1);
assert.equal((await db.query("select count(*)::int as total from public.direitos_acesso")).rows[0].total, 1);

await entrar({ sub: dona, aal: "aal2", session_id: sessaoDona });
assert.equal((await db.query("select public.pode_ver_financeiro() as ok")).rows[0].ok, true);

await db.exec(`delete from auth.sessions where id = '${sessaoDona}'`);
await entrar({ sub: dona, aal: "aal1", session_id: sessaoDona });
assert.equal((await db.query("select public.sou_admin() as ok")).rows[0].ok, false);
assert.match((await chamar("arquivar_atividade", "material-ficticio")).mensagem, /não está mais ativa/);
await db.exec(`insert into auth.sessions (id, user_id) values ('${sessaoDona}', '${dona}')`);

await entrar({ sub: gestor, aal: "aal1", session_id: sessaoGestor });
assert.equal((await db.query("select public.sou_admin() as ok")).rows[0].ok, true);
assert.equal((await db.query("select public.pode_ver_financeiro() as ok")).rows[0].ok, false);
assert.match((await chamar("arquivar_atividade", "material-ficticio")).mensagem, /proprietária/);

await entrar({ sub: cliente, aal: "aal1", session_id: sessaoCliente });
assert.equal((await db.query("select public.sou_admin() as ok")).rows[0].ok, false);
assert.match((await chamar("arquivar_atividade", "material-ficticio")).mensagem, /proprietária/);
await entrar({ sub: cliente, aal: "aal2", session_id: sessaoCliente });
assert.equal((await db.query("select public.sou_admin() as ok")).rows[0].ok, false);

await db.exec("select set_config('request.jwt.claims', '', false)");
await db.exec("set role anon");
await assert.rejects(() => db.query("select public.sou_admin()"), /permission denied/);
await db.exec("reset role");

const funcoes = await db.query(`
  select proname
  from pg_proc
  join pg_namespace n on n.oid = pronamespace
  where n.nspname = 'public' and proname ilike '%estorn%'
`);
assert.equal(funcoes.rows.length, 0);

console.log("ok catálogo sem segundo fator");
