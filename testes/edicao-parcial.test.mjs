import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const dona = "11111111-1111-4111-8111-111111111111";
const adminId = "33333333-3333-4333-8333-333333333333";
const clienteId = "66666666-6666-4666-8666-666666666666";

const db = new PGlite();
const arquivo = (nome) => readFileSync(new URL(`../supabase/${nome}`, import.meta.url), "utf8");

async function sql(texto) {
  return db.exec(texto);
}

async function linhas(texto) {
  return (await db.query(texto)).rows;
}

async function um(texto) {
  return (await linhas(texto))[0];
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
    select jsonb_build_object('role', auth.role())
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
`);

const eu = (await um("select current_user as nome")).nome;
await sql(`grant anon, authenticated, service_role to "${eu.replaceAll('"', "")}"`);
await sql(arquivo("esquema.sql"));
await sql(`
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${dona}', 'leticiapimenteldemacedo@gmail.com', '{"nome":"Teste"}'::jsonb),
    ('${adminId}', 'admin.teste@example.com', '{"nome":"Teste"}'::jsonb),
    ('${clienteId}', 'cliente.vazio@example.com', '{"nome":"Teste"}'::jsonb);
`);
await sql(arquivo("migracao-permissoes.sql"));
const edicaoAntiga = await um(`
  select md5(pg_get_functiondef('public.editar_atividade(text,text,text,text,numeric,text,text,text,boolean,text,text,jsonb)'::regprocedure)) as hash
`);
await sql(arquivo("migracao-edicao-parcial.sql"));
const edicaoNova = await um(`
  select md5(pg_get_functiondef('public.editar_atividade(text,text,text,text,numeric,text,text,text,boolean,text,text,jsonb)'::regprocedure)) as hash
`);
assert.equal(edicaoNova.hash, edicaoAntiga.hash);
await sql(`
  insert into public.atividades (
    id, titulo, preco, arquivo, resumo, explicacao, area, tema, informacoes, destaque, capa
  ) values (
    'material-ficticio', 'Material de teste', 4.90, 'material-ficticio.pdf',
    '', '', '', '', '[]'::jsonb, false, ''
  );
`);

const foto = () => linhas(`
  select id, titulo, resumo, explicacao, preco::text as preco, arquivo, area, tema, capa, informacoes::text as informacoes
  from public.atividades
  where id <> 'material-ficticio'
  order by id
`);
const reaisAntes = await foto();

await sql("reset role");
await sql(`
  select set_config('app.alterar_cargo', 'sim', false);
  update public.perfis set papel = 'admin', acesso_financeiro = true where id = '${adminId}';
  select set_config('app.alterar_cargo', '', false);
`);

await como("authenticated", adminId);
const titulo = await um(`
  select titulo, resumo, explicacao, preco::text as preco, arquivo, capa
  from public.editar_campos('material-ficticio', '{"titulo":"Só o título"}'::jsonb)
`);
assert.equal(titulo.titulo, "Só o título");
assert.equal(titulo.resumo, "");
assert.equal(titulo.explicacao, "");
assert.equal(titulo.preco, "4.90");
assert.equal(titulo.arquivo, "material-ficticio.pdf");
assert.equal(titulo.capa, "");

const preco = await um(`
  select titulo, preco::text as preco, resumo
  from public.editar_campos('material-ficticio', '{"preco":7.5}'::jsonb)
`);
assert.equal(preco.titulo, "Só o título");
assert.equal(preco.preco, "7.50");
assert.equal(preco.resumo, "");

const descricao = await um(`
  select titulo, resumo, preco::text as preco
  from public.editar_campos('material-ficticio', '{"resumo":"Descrição gravada agora."}'::jsonb)
`);
assert.equal(descricao.titulo, "Só o título");
assert.equal(descricao.resumo, "Descrição gravada agora.");
assert.equal(descricao.preco, "7.50");

const antesDaFalha = await um(`
  select titulo, resumo, preco::text as preco, arquivo from public.atividades where id = 'material-ficticio'
`);
assert.match(await falha(`select public.editar_campos('material-ficticio', '{"preco":0}'::jsonb)`), /preço/);
assert.match(await falha(`select public.editar_campos('material-ficticio', '{"preco":"4,90"}'::jsonb)`), /preço/);
assert.match(await falha(`select public.editar_campos('material-ficticio', '{"titulo":null}'::jsonb)`), /atividade/);
assert.match(await falha(`select public.editar_campos('material-ficticio', '{"informacoes":{"catalogo":"texto"}}'::jsonb)`), /lista/);
assert.match(await falha(`select public.editar_campos('material-ficticio', '{}'::jsonb)`), /campo permitido/);
assert.match(await falha(`select public.editar_campos('material-ficticio', '{"arquivo":"outro.pdf","capa":"https://exemplo/capa.jpg"}'::jsonb)`), /campo permitido/);
const depoisDaFalha = await um(`
  select titulo, resumo, preco::text as preco, arquivo, capa from public.atividades where id = 'material-ficticio'
`);
assert.equal(depoisDaFalha.titulo, antesDaFalha.titulo);
assert.equal(depoisDaFalha.resumo, antesDaFalha.resumo);
assert.equal(depoisDaFalha.preco, antesDaFalha.preco);
assert.equal(depoisDaFalha.arquivo, antesDaFalha.arquivo);
assert.equal(depoisDaFalha.capa, "");

const comArquivo = await um(`
  select titulo, arquivo, capa
  from public.editar_campos('material-ficticio', '{"titulo":"Título sem mexer no arquivo","arquivo":"trocado.pdf","capa":"https://exemplo/capa.jpg"}'::jsonb)
`);
assert.equal(comArquivo.titulo, "Título sem mexer no arquivo");
assert.equal(comArquivo.arquivo, "material-ficticio.pdf");
assert.equal(comArquivo.capa, "");

assert.match(await falha(`
  select public.editar_atividade(
    'material-ficticio', 'Outro título completo', '', '', 4.90,
    '', '', '', false, '', '', '[]'::jsonb
  )
`), /descrição breve/);
assert.equal((await um(`select titulo from public.atividades where id = 'material-ficticio'`)).titulo, "Título sem mexer no arquivo");

await sql("reset role");
await sql(`
  alter table public.atividades alter column area drop not null;
  update public.atividades set area = null where id = 'material-ficticio';
`);
await como("authenticated", adminId);
const areaNula = await um(`
  select titulo, area is null as area_nula, resumo, arquivo
  from public.editar_campos('material-ficticio', '{"titulo":"Título com área nula"}'::jsonb)
`);
assert.equal(areaNula.titulo, "Título com área nula");
assert.equal(areaNula.area_nula, true);
assert.equal(areaNula.resumo, "Descrição gravada agora.");
assert.equal(areaNula.arquivo, "material-ficticio.pdf");

await como("authenticated", dona);
const daDona = await um(`
  select titulo, inclui
  from public.editar_campos('material-ficticio', '{"inclui":"Item da proprietária"}'::jsonb)
`);
assert.equal(daDona.titulo, "Título com área nula");
assert.equal(daDona.inclui, "Item da proprietária");

await como("authenticated", clienteId);
assert.match(await falha(`select public.editar_campos('material-ficticio', '{"titulo":"Cliente"}'::jsonb)`), /Sem permissão/);
await como("anon", "");
assert.match(await falha(`select public.editar_campos('material-ficticio', '{"titulo":"Visita"}'::jsonb)`), /permission denied|permissão/i);
await como("postgres", "");
assert.equal((await um(`select titulo from public.atividades where id = 'material-ficticio'`)).titulo, "Título com área nula");
assert.deepEqual(await foto(), reaisAntes);

await sql(arquivo("migracao-arquivo.sql"));
await como("authenticated", adminId);
assert.match(await falha(`select public.definir_arquivo('material-ficticio', 'versao-10.pdf')`), /ainda não está guardado/);
assert.equal((await um(`select arquivo from public.atividades where id = 'material-ficticio'`)).arquivo, "material-ficticio.pdf");
await sql("reset role");
await sql(`insert into storage.objects (bucket_id, name) values ('atividades', 'material-ficticio/versao-10.pdf')`);
await como("authenticated", adminId);
await sql(`select public.definir_arquivo('material-ficticio', 'versao-10.pdf')`);
const apontado = await um(`select titulo, arquivo from public.atividades where id = 'material-ficticio'`);
assert.equal(apontado.arquivo, "versao-10.pdf");
assert.equal(apontado.titulo, "Título com área nula");
await sql("reset role");
assert.deepEqual(await foto(), reaisAntes);

const antesDaReversao = await foto();
await sql(arquivo("reverter-edicao-parcial.sql"));
assert.equal(Number((await um(`
  select count(*)::int as total
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'editar_campos'
`)).total), 0);
assert.equal(Number((await um(`
  select count(*)::int as total
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'editar_atividade'
`)).total), 1);
assert.deepEqual(await foto(), antesDaReversao);

console.log("ok edição parcial isolada");
