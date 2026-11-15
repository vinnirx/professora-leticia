import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const dona = "11111111-1111-4111-8111-111111111111";
const gestor = "22222222-2222-4222-8222-222222222222";
const cliente = "33333333-3333-4333-8333-333333333333";
const alvo = "44444444-4444-4444-8444-444444444444";
const sessaoDona = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sessaoGestor = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sessaoCliente = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const db = new PGlite();
const arquivo = (nome) => readFileSync(new URL(`../supabase/${nome}`, import.meta.url), "utf8");

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
  insert into public.perfis (id, papel, acesso_financeiro) values
    ('${dona}', 'owner', true),
    ('${gestor}', 'admin', true),
    ('${cliente}', 'cliente', false),
    ('${alvo}', 'cliente', false);
  insert into public.proprietaria (id, usuario_id) values (1, '${dona}');
  insert into auth.sessions (id, user_id) values
    ('${sessaoDona}', '${dona}'),
    ('${sessaoGestor}', '${gestor}'),
    ('${sessaoCliente}', '${cliente}');
  create or replace function public.id_proprietaria()
  returns uuid language sql stable as $$
    select usuario_id from public.proprietaria where id = 1
  $$;
  create or replace function public.proteger_cargo()
  returns trigger language plpgsql as $$
  begin
    if new.papel is not distinct from old.papel
       and new.acesso_financeiro is not distinct from old.acesso_financeiro then
      return new;
    end if;
    if current_setting('app.alterar_cargo', true) is distinct from 'sim' then
      raise exception 'Cargo protegido.';
    end if;
    return new;
  end $$;
  create trigger proteger_cargo before update on public.perfis
  for each row execute function public.proteger_cargo();
`);

await db.exec(arquivo("migracao-sessao-ativa.sql"));
await db.exec(arquivo("migracao-exigir-sessao-admin.sql"));

async function entrar(claims) {
  await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify(claims).replaceAll("'", "''")}', false)`);
}

async function papel(id) {
  const resultado = await db.query(`select papel from public.perfis where id = '${id}'`);
  return resultado.rows[0].papel;
}

const agora = Math.floor(Date.now() / 1000);
const antigo = agora - 3600;

await entrar({ sub: cliente, aal: "aal1", session_id: sessaoCliente, iat: agora });
assert.equal((await db.query("select public.sou_admin() as ok")).rows[0].ok, false);
let promocao = await db.query(`select public.definir_papel('${cliente}', 'admin') as resultado`);
assert.equal(promocao.rows[0].resultado.ok, false);
assert.equal(await papel(cliente), "cliente");

await entrar({ sub: cliente, aal: "aal2", session_id: sessaoCliente, iat: agora });
assert.equal((await db.query("select public.sou_admin() as ok")).rows[0].ok, false);
promocao = await db.query(`select public.definir_papel('${alvo}', 'super_admin') as resultado`);
assert.equal(promocao.rows[0].resultado.ok, false);
assert.equal(await papel(alvo), "cliente");

await entrar({ sub: gestor, aal: "aal1", session_id: sessaoGestor, iat: agora });
assert.equal((await db.query("select public.sou_admin() as ok")).rows[0].ok, true);
assert.equal((await db.query("select public.pode_ver_financeiro() as ok")).rows[0].ok, true);

await db.exec(`delete from auth.sessions where id = '${sessaoGestor}'`);
assert.equal((await db.query("select public.sou_admin() as ok")).rows[0].ok, false);
promocao = await db.query(`select public.definir_papel('${alvo}', 'admin') as resultado`);
assert.equal(promocao.rows[0].resultado.mensagem, "Esta sessão não está mais ativa.");
assert.equal(await papel(alvo), "cliente");

await db.exec(`insert into auth.sessions (id, user_id) values ('${sessaoGestor}', '${gestor}')`);
await entrar({ sub: gestor, aal: "aal2", session_id: sessaoCliente, iat: agora });
assert.equal((await db.query("select public.sessao_ainda_valida() as ok")).rows[0].ok, false);

await entrar({ sub: gestor, aal: "aal2", iat: agora });
assert.equal((await db.query("select public.sessao_ainda_valida() as ok")).rows[0].ok, false);
await db.exec(`update auth.sessions set not_after = now() - interval '1 minute' where id = '${sessaoGestor}'`);
await entrar({ sub: gestor, aal: "aal2", session_id: sessaoGestor, iat: agora });
assert.equal((await db.query("select public.sessao_ainda_valida() as ok")).rows[0].ok, false);
await db.exec(`update auth.sessions set not_after = null where id = '${sessaoGestor}'`);

await entrar({ sub: dona, aal: "aal1", session_id: sessaoDona, iat: antigo });
promocao = await db.query(`select public.definir_papel('${alvo}', 'super_admin') as resultado`);
assert.equal(promocao.rows[0].resultado.mensagem, "Confirme sua senha de novo para alterar Super Admin.");
assert.equal(await papel(alvo), "cliente");

await entrar({ sub: dona, aal: "aal1", session_id: sessaoDona, iat: agora });
assert.equal((await db.query("select public.motivo_proprietaria() as motivo")).rows[0].motivo, "");
const historico = await db.query("select count(*)::int as total from public.historico_permissoes()");
assert.equal(historico.rows[0].total >= 0, true);
let listaNegada = false;
try {
  await entrar({ sub: cliente, aal: "aal2", session_id: sessaoCliente, iat: agora });
  await db.query("select * from public.listar_conciliacao()");
} catch (erro) {
  listaNegada = /Sem permissão/.test(String(erro.message || erro));
}
assert.equal(listaNegada, true);

await entrar({ sub: dona, aal: "aal1", session_id: sessaoDona, iat: agora });
promocao = await db.query(`select public.definir_papel('${alvo}', 'admin') as resultado`);
assert.equal(promocao.rows[0].resultado.ok, true);
assert.equal(await papel(alvo), "admin");
await db.exec(`
  select set_config('app.alterar_cargo', 'sim', false);
  update public.perfis set papel = 'cliente', acesso_financeiro = false where id = '${alvo}';
  select set_config('app.alterar_cargo', '', false);
`);

await db.exec(arquivo("migracao-aal2-admin.sql"));
await entrar({ sub: dona, aal: "aal1", session_id: sessaoDona, iat: agora });
assert.equal((await db.query("select public.motivo_proprietaria() as motivo")).rows[0].motivo, "Confirme o segundo fator para continuar.");
let historicoNegado = false;
try {
  await db.query("select * from public.historico_permissoes()");
} catch (erro) {
  historicoNegado = /Confirme o segundo fator/.test(String(erro.message || erro));
}
assert.equal(historicoNegado, true);
await entrar({ sub: gestor, aal: "aal2", session_id: sessaoGestor, iat: agora });
assert.equal((await db.query("select public.motivo_proprietaria() as motivo")).rows[0].motivo, "Sem permissão.");

await entrar({ sub: gestor, aal: "aal1", session_id: sessaoGestor, iat: agora });
assert.equal((await db.query("select public.sou_admin() as ok")).rows[0].ok, false);
assert.equal((await db.query("select public.pode_ver_financeiro() as ok")).rows[0].ok, false);
promocao = await db.query(`select public.definir_papel('${alvo}', 'admin') as resultado`);
assert.equal(promocao.rows[0].resultado.mensagem, "Confirme o segundo fator para continuar.");
assert.equal(await papel(alvo), "cliente");

await entrar({ sub: gestor, aal: "aal2", session_id: sessaoGestor, iat: agora });
assert.equal((await db.query("select public.sou_admin() as ok")).rows[0].ok, true);
assert.equal((await db.query("select public.pode_ver_financeiro() as ok")).rows[0].ok, true);

await entrar({ sub: dona, aal: "aal2", session_id: sessaoDona, iat: agora });
assert.equal((await db.query("select public.sou_admin() as ok")).rows[0].ok, true);
promocao = await db.query(`select public.definir_papel('${alvo}', 'admin') as resultado`);
assert.equal(promocao.rows[0].resultado.ok, true);
assert.equal(await papel(alvo), "admin");

await entrar({ sub: cliente, aal: "aal2", session_id: sessaoCliente, iat: agora });
assert.equal((await db.query("select public.sou_admin() as ok")).rows[0].ok, false);
let pedidoInvalido = false;
try {
  await db.query(`select public.definir_papel('${cliente}', 'owner') as resultado`);
} catch (erro) {
  pedidoInvalido = /Pedido inválido/.test(String(erro.message || erro));
}
assert.equal(pedidoInvalido, true);
promocao = await db.query(`select public.definir_papel('${cliente}', 'super_admin') as resultado`);
assert.equal(promocao.rows[0].resultado.ok, false);
assert.equal(await papel(cliente), "cliente");

await db.exec(`delete from auth.sessions where id = '${sessaoDona}'`);
await entrar({ sub: dona, aal: "aal2", session_id: sessaoDona, iat: agora });
promocao = await db.query(`select public.definir_papel('${alvo}', 'cliente') as resultado`);
assert.equal(promocao.rows[0].resultado.mensagem, "Esta sessão não está mais ativa.");
assert.equal(await papel(alvo), "admin");

await db.exec(`insert into auth.sessions (id, user_id) values ('${sessaoDona}', '${dona}')`);
await db.exec(arquivo("migracao-exigir-sessao-admin.sql"));
await entrar({ sub: gestor, aal: "aal1", session_id: sessaoGestor, iat: agora });
assert.equal((await db.query("select public.sou_admin() as ok")).rows[0].ok, true);
await entrar({ sub: dona, aal: "aal1", session_id: sessaoDona, iat: agora });
assert.equal((await db.query("select public.motivo_proprietaria() as motivo")).rows[0].motivo, "");
await db.exec(arquivo("reverter-exigir-sessao-admin.sql"));
await db.exec(`delete from auth.sessions where id = '${sessaoDona}'`);
await entrar({ sub: dona, aal: "aal1", session_id: sessaoDona, iat: agora });
assert.equal((await db.query("select public.motivo_proprietaria() as motivo")).rows[0].motivo, "");
assert.equal((await db.query("select public.sou_admin() as ok")).rows[0].ok, true);
promocao = await db.query(`select public.definir_papel('${alvo}', 'cliente') as resultado`);
assert.equal(promocao.rows[0].resultado.ok, true);
assert.equal(await papel(alvo), "cliente");
promocao = await db.query(`select public.definir_financeiro('${gestor}', false) as resultado`);
assert.equal(promocao.rows[0].resultado.ok, true);

console.log("ok defesa administrativa isolada");
