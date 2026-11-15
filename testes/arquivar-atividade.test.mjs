import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const dona = "11111111-1111-4111-8111-111111111111";
const gestor = "22222222-2222-4222-8222-222222222222";
const cliente = "33333333-3333-4333-8333-333333333333";
const db = new PGlite();
const arquivo = readFileSync(new URL("../supabase/migracao-arquivar-atividade.sql", import.meta.url), "utf8");
const reversao = readFileSync(new URL("../supabase/reverter-arquivar-atividade.sql", import.meta.url), "utf8");

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  end $$;
  create schema if not exists auth;
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
    papel text not null
  );
  create table public.proprietaria (
    id integer primary key,
    usuario_id uuid not null
  );
  create or replace function public.id_proprietaria()
  returns uuid language sql stable as $$
    select usuario_id from public.proprietaria where id = 1
  $$;
  create or replace function public.sou_admin()
  returns boolean language sql stable security definer set search_path = public as $$
    select exists (
      select 1 from public.perfis
      where id = auth.uid() and papel in ('admin', 'super_admin', 'owner')
    )
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
  insert into public.atividades (id, titulo, preco, arquivo) values
    ('material-ficticio', 'Material fictício', 4.90, 'material.pdf'),
    ('sem-venda', 'Sem venda', 4.90, 'sem-venda.pdf'),
    ('sem-arquivo', 'Sem arquivo', 4.90, '');
  insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid)
  values ('${cliente}', 'material-ficticio', 'Material fictício', 4.90, 'PEDIDO-FICTICIO');
  insert into public.direitos_acesso (usuario_id, atividade_id)
  values ('${cliente}', 'material-ficticio');
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant execute on function auth.jwt() to anon, authenticated;
  grant execute on function public.sou_admin() to anon, authenticated;
  alter table public.atividades enable row level security;
  alter table public.atividades force row level security;
  grant select on public.atividades to anon, authenticated;
`);

await db.exec(arquivo);

async function entrar(usuario) {
  const claims = JSON.stringify({ sub: usuario, aal: "aal1" }).replaceAll("'", "''");
  await db.exec(`select set_config('request.jwt.claims', '${claims}', false)`);
}

async function chamar(funcao, atividade) {
  const resultado = await db.query(`select public.${funcao}('${atividade}') as resultado`);
  return resultado.rows[0].resultado;
}

await entrar(gestor);
assert.equal((await chamar("arquivar_atividade", "material-ficticio")).ok, false);
await entrar(cliente);
assert.equal((await chamar("arquivar_atividade", "material-ficticio")).ok, false);

await entrar(dona);
const arquivada = await chamar("arquivar_atividade", "material-ficticio");
assert.equal(arquivada.ok, true);
assert.match(arquivada.mensagem, /saiu da loja/);
await assert.rejects(
  () => db.query(`
    insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid)
    values ('${cliente}', 'material-ficticio', 'Material fictício', 4.90, 'NOVO-FICTICIO')
  `),
  /não está mais à venda/,
);
const pedido = await db.query("select count(*)::int as total from public.pedidos where atividade_id = 'material-ficticio'");
assert.equal(pedido.rows[0].total, 1);
const direito = await db.query("select count(*)::int as total from public.direitos_acesso where atividade_id = 'material-ficticio'");
assert.equal(direito.rows[0].total, 1);
assert.equal((await chamar("apagar_atividade_sem_venda", "material-ficticio")).ok, false);
assert.equal((await db.query("select count(*)::int as total from public.atividades where id = 'material-ficticio'")).rows[0].total, 1);

const semArquivo = await chamar("arquivar_atividade", "sem-arquivo");
assert.equal(semArquivo.ok, true);
assert.match((await chamar("restaurar_atividade", "sem-arquivo")).mensagem, /preço e PDF/);
assert.equal((await chamar("restaurar_atividade", "material-ficticio")).ok, true);
assert.equal((await chamar("arquivar_atividade", "sem-venda")).ok, true);
assert.equal((await chamar("apagar_atividade_sem_venda", "sem-venda")).ok, true);
assert.equal((await db.query("select count(*)::int as total from public.atividades where id = 'sem-venda'")).rows[0].total, 0);
const auditoria = await db.query("select count(*)::int as total from public.auditoria_atividades");
assert.equal(auditoria.rows[0].total >= 4, true);

await db.exec(`select set_config('request.jwt.claims', '', false); set role anon`);
const vitrine = await db.query("select id from public.atividades order by id");
await db.exec("reset role");
assert.deepEqual(vitrine.rows.map((linha) => linha.id), ["material-ficticio"]);

await db.exec(reversao);
await entrar(dona);
await assert.rejects(() => chamar("arquivar_atividade", "material-ficticio"));
const voltou = await db.query("select arquivada_em from public.atividades where id = 'sem-arquivo'");
assert.equal(voltou.rows[0].arquivada_em, null);
await db.query(`
  insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid)
  values ('${cliente}', 'material-ficticio', 'Material fictício', 4.90, 'DEPOIS-REVERSAO')
`);

console.log("ok arquivar atividade isolada");
