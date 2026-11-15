import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const dona = "11111111-1111-4111-8111-111111111111";
const cliente = "44444444-4444-4444-8444-444444444444";
const outro = "55555555-5555-4555-8555-555555555555";
const semCompra = "66666666-6666-4666-8666-666666666666";

const db = new PGlite();
const arquivo = (nome) => readFileSync(new URL(`../supabase/${nome}`, import.meta.url), "utf8");

async function sql(texto) {
  return db.exec(texto);
}

async function linhas(texto) {
  return (await db.query(texto)).rows;
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
  if (papel !== "postgres") await sql(`set role ${papel}`);
}

await sql(`
  create schema if not exists auth;
  create table auth.users (
    id uuid primary key,
    email text not null,
    created_at timestamptz not null default now(),
    email_confirmed_at timestamptz,
    last_sign_in_at timestamptz
  );
  create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  end $$;
  create table public.perfis (
    id uuid primary key,
    nome text not null,
    email text not null,
    papel text not null,
    acesso_financeiro boolean not null default false
  );
  create table public.pedidos (
    id uuid primary key default gen_random_uuid(),
    usuario_id uuid not null,
    txid text not null,
    titulo text not null,
    valor numeric not null
  );
  insert into auth.users (id, email, email_confirmed_at, last_sign_in_at) values
    ('${dona}', 'dona@exemplo.test', now(), now()),
    ('${cliente}', 'cliente@exemplo.test', now(), now()),
    ('${outro}', 'outro@exemplo.test', null, null),
    ('${semCompra}', 'sem-compra@exemplo.test', now(), null);
  insert into public.perfis (id, nome, email, papel, acesso_financeiro) values
    ('${dona}', 'Proprietária fictícia', 'dona@exemplo.test', 'owner', true),
    ('${cliente}', 'Cliente fictício', 'cliente@exemplo.test', 'cliente', false),
    ('${outro}', 'Outro cliente', 'outro@exemplo.test', 'cliente', false),
    ('${semCompra}', 'Cliente sem compra', 'sem-compra@exemplo.test', 'cliente', false);
  insert into public.pedidos (usuario_id, txid, titulo, valor)
    values ('${cliente}', 'PIXFICTICIO01', 'Material fictício', 4.90);
  create or replace function public.sou_admin() returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (
      select 1 from public.perfis
      where id = auth.uid() and papel in ('owner', 'super_admin', 'admin')
    )
  $$;
  revoke all on function public.sou_admin() from public, anon;
  grant execute on function public.sou_admin() to authenticated;
`);

await sql(arquivo("migracao-atendimento.sql"));

await como("authenticated", cliente);
await sql(`
  insert into public.solicitacoes (usuario_id, txid, assunto, status)
  values ('${cliente}', 'PIXDEOUTRAPESSOA', 'download', 'resolvido');
`);
const proprio = (await linhas("select status, txid from public.solicitacoes"))[0];
assert.equal(proprio.status, "aberto");
assert.equal(proprio.txid, "");
const chamado = (await linhas("select id from public.solicitacoes"))[0].id;
await sql(`
  insert into public.solicitacao_mensagens (solicitacao_id, autor_id, texto)
  values ('${chamado}', '${cliente}', 'Não consegui baixar o arquivo fictício.');
`);
assert.equal((await linhas("select count(*)::int as total from public.solicitacoes"))[0].total, 1);
await sql(`update public.solicitacoes set status = 'resolvido' where id = '${chamado}'`);
assert.equal((await linhas(`select status from public.solicitacoes where id = '${chamado}'`))[0].status, "aberto");

await como("authenticated", outro);
assert.equal((await linhas("select * from public.solicitacoes")).length, 0);
assert.match(await falha(`
  insert into public.solicitacao_mensagens (solicitacao_id, autor_id, texto)
  values ('${chamado}', '${outro}', 'Tentativa de escrever no chamado alheio.');
`), /row-level security|policy/i);
await sql(`update public.solicitacoes set status = 'resolvido' where id = '${chamado}'`);
assert.match(await falha("select * from public.listar_contas('', 20, 0)"), /Sem permissão/);

await como("authenticated", dona);
const contas = await linhas("select nome from public.listar_contas('', 20, 0)");
assert.equal(contas.some((item) => item.nome === "Cliente sem compra"), true);
const amostra = (await linhas("select * from public.listar_contas('', 20, 0)"))[0];
assert.deepEqual(Object.keys(amostra).sort(), ["acesso_financeiro", "criado_em", "email", "email_confirmado", "id", "nome", "papel", "ultimo_acesso"]);
assert.equal((await linhas(`select status from public.solicitacoes where id = '${chamado}'`))[0].status, "aberto");
await sql(`update public.solicitacoes set status = 'resolvido' where id = '${chamado}'`);
assert.equal((await linhas(`select status from public.solicitacoes where id = '${chamado}'`))[0].status, "resolvido");
assert.match(await falha(`
  update public.solicitacoes set usuario_id = '${dona}' where id = '${chamado}';
`), /dono do chamado/);

await como("postgres", "");
await sql(arquivo("reverter-atendimento.sql"));
assert.equal((await linhas("select to_regclass('public.solicitacoes') as nome"))[0].nome, null);
assert.equal((await linhas("select to_regclass('public.solicitacao_mensagens') as nome"))[0].nome, null);
assert.match(await falha("select * from public.listar_contas('', 20, 0)"), /listar_contas|does not exist|não exist/i);

const texto = arquivo("migracao-atendimento.sql");
assert.doesNotMatch(texto, /service_role|encrypted_password|raw_user_meta_data|ASAAS_API_KEY/i);
assert.match(texto, /NÃO execute este arquivo sem autorização/);

console.log("ok central de ajuda isolada e reversão");
