import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { escolherNovidades } from "../js/vitrine.js";

const arquivo = (nome) => readFileSync(new URL(`../${nome}`, import.meta.url), "utf8");
const proposta = arquivo("supabase/migracao-publicada-em.sql");
const reversao = arquivo("supabase/reverter-publicada-em.sql");
const inicio = arquivo("index.html");
const catalogo = arquivo("js/catalogo.js");
const atividades = arquivo("atividades/index.html");

for (const nome of [
  "criar_atividade",
  "editar_campos",
  "definir_arquivo",
  "definir_capa",
  "arquivar_atividade",
  "restaurar_atividade",
  "apagar_atividade_sem_venda",
]) {
  assert.doesNotMatch(proposta, new RegExp(`function public\\.${nome}`));
}
assert.doesNotMatch(proposta, /\bgrant\b/i);
assert.doesNotMatch(proposta, /policy/i);
assert.doesNotMatch(proposta, /\bupdate\s+public\.atividades/i);
assert.match(proposta, /new\.publicada_em := now\(\)/);
assert.match(proposta, /new\.publicada_em := old\.publicada_em/);
assert.match(reversao, /drop column if exists publicada_em/);
assert.match(inicio, /<h2 id="titulo-atividades">Novidades<\/h2>/);
assert.match(catalogo, /escolherNovidades\(encontradas\)/);
assert.match(catalogo, /Ver Atividade/);
assert.match(catalogo, /Adicionar ao carrinho/);
assert.match(catalogo, /destaque !== false/);
assert.match(atividades, /<h1 id="titulo-atividades">Atividades<\/h1>/);

const db = new PGlite();
const instante = (valor) => new Date(valor).toISOString();
const ids = async (sql) => (await db.query(sql)).rows.map((linha) => linha.id);

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  end $$;
  create table public.atividades (
    id text primary key,
    titulo text not null,
    preco numeric(10, 2) not null,
    arquivo text not null,
    capa text not null default '',
    arquivada_em timestamptz
  );
`);
await db.exec(proposta);
await db.exec(proposta);

await db.exec(`
  insert into public.atividades (id, titulo, preco, arquivo, publicada_em)
  values ('primeira', 'Atividade publicada agora', 5.00, 'primeira.pdf', '2001-01-01T00:00:00Z');
  insert into public.atividades (id, titulo, preco, arquivo, arquivada_em, publicada_em)
  values ('rascunho', 'Ainda fora da loja', 5.00, 'rascunho.pdf', now(), '2001-01-01T00:00:00Z');
`);

const primeira = (await db.query("select publicada_em, arquivada_em from public.atividades where id = 'primeira'")).rows[0];
const rascunho = (await db.query("select publicada_em from public.atividades where id = 'rascunho'")).rows[0];
assert.ok(primeira.publicada_em, "a primeira publicação precisa gravar a data");
assert.ok(new Date(primeira.publicada_em) > new Date("2026-01-01T00:00:00Z"));
assert.notEqual(instante(primeira.publicada_em), "2001-01-01T00:00:00.000Z");
assert.equal(primeira.arquivada_em, null);
assert.equal(rascunho.publicada_em, null);

const original = instante(primeira.publicada_em);
await db.exec(`
  update public.atividades
  set titulo = 'Titulo editado', preco = 6.00, capa = 'capa.png', arquivo = 'outro.pdf',
      publicada_em = '1999-01-01T00:00:00Z'
  where id = 'primeira';
`);
const editada = (await db.query("select titulo, preco, capa, arquivo, publicada_em from public.atividades where id = 'primeira'")).rows[0];
assert.equal(editada.titulo, "Titulo editado");
assert.equal(Number(editada.preco), 6);
assert.equal(editada.capa, "capa.png");
assert.equal(editada.arquivo, "outro.pdf");
assert.equal(instante(editada.publicada_em), original);

await db.exec("update public.atividades set arquivada_em = now(), publicada_em = '1998-01-01T00:00:00Z' where id = 'primeira'");
const retirada = (await db.query("select arquivada_em, publicada_em from public.atividades where id = 'primeira'")).rows[0];
assert.ok(retirada.arquivada_em);
assert.equal(instante(retirada.publicada_em), original);
assert.deepEqual(await ids("select id from public.atividades where arquivada_em is null order by id"), []);

await db.exec("update public.atividades set arquivada_em = null, publicada_em = '1997-01-01T00:00:00Z' where id = 'primeira'");
const republicada = (await db.query("select arquivada_em, publicada_em from public.atividades where id = 'primeira'")).rows[0];
assert.equal(republicada.arquivada_em, null);
assert.equal(instante(republicada.publicada_em), original);

await db.exec("delete from public.atividades where id = 'primeira'");
assert.equal((await db.query("select count(*)::int as total from public.atividades where id = 'primeira'")).rows[0].total, 0);

await db.exec("alter table public.atividades disable trigger registrar_primeira_publicacao");
await db.exec(`
  insert into public.atividades (id, titulo, preco, arquivo, publicada_em) values
    ('antiga-a', 'Antiga A', 9.90, 'antiga-a.pdf', null),
    ('antiga-b', 'Antiga B', 9.90, 'antiga-b.pdf', null),
    ('antiga-c', 'Antiga C', 5.00, 'antiga-c.pdf', null),
    ('antiga-d', 'Antiga D', 5.00, 'antiga-d.pdf', null),
    ('velha', 'Com data antiga', 5.00, 'velha.pdf', '2026-11-01T12:00:00Z'),
    ('recente', 'Com data recente', 5.00, 'recente.pdf', '2026-11-10T12:00:00Z');
`);
await db.exec("alter table public.atividades enable trigger registrar_primeira_publicacao");

await db.exec(`
  update public.atividades set titulo = 'Antiga A editada', arquivada_em = now() where id = 'antiga-a';
  update public.atividades set arquivada_em = null where id = 'antiga-a';
  update public.atividades set arquivo = 'velha-nova.pdf', capa = 'velha.png' where id = 'velha';
`);
assert.equal((await db.query("select publicada_em from public.atividades where id = 'antiga-a'")).rows[0].publicada_em, null);
assert.equal(instante((await db.query("select publicada_em from public.atividades where id = 'velha'")).rows[0].publicada_em), "2026-11-01T12:00:00.000Z");

await db.exec(`
  insert into public.atividades (id, titulo, preco, arquivo, publicada_em)
  values ('quinta', 'Quinta atividade', 5.00, 'quinta.pdf', '1990-01-01T00:00:00Z');
`);
const ordem = await ids(`
  select id from public.atividades
  where arquivada_em is null and id <> 'rascunho'
  order by publicada_em desc nulls last, id asc
  limit 4
`);
assert.deepEqual(ordem, ["quinta", "recente", "velha", "antiga-a"]);
const catalogoCompleto = await ids(`
  select id from public.atividades
  where arquivada_em is null and id <> 'rascunho'
  order by publicada_em desc nulls last, id asc
`);
assert.equal(catalogoCompleto.includes("antiga-d"), true);
assert.equal(ordem.includes("antiga-d"), false);

const quinta = instante((await db.query("select publicada_em from public.atividades where id = 'quinta'")).rows[0].publicada_em);
assert.ok(new Date(quinta) > new Date("2026-11-10T12:00:00Z"));

const modelos = [
  { id: "antiga-a" },
  { id: "antiga-d" },
  { id: "antiga-b" },
  { id: "velha", publicadaEm: "2026-11-01T12:00:00Z" },
  { id: "recente", publicada_em: "2026-11-10T12:00:00Z" },
  { id: "antiga-c" },
  { id: "rascunho", arquivada_em: "2026-11-20T12:00:00Z" },
  { id: "quinta", publicadaEm: quinta },
];
assert.deepEqual(escolherNovidades(modelos).map((item) => item.id), ["quinta", "recente", "velha", "antiga-a"]);
assert.equal(modelos.some((item) => item.id === "antiga-d"), true);

await db.exec(reversao);
const coluna = await db.query(`
  select count(*)::int as total
  from information_schema.columns
  where table_schema = 'public' and table_name = 'atividades' and column_name = 'publicada_em'
`);
assert.equal(coluna.rows[0].total, 0);
const gatilho = await db.query("select count(*)::int as total from pg_trigger where tgname = 'registrar_primeira_publicacao'");
assert.equal(gatilho.rows[0].total, 0);

console.log("ok novidades");
