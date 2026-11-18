import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const dona = "11111111-1111-4111-8111-111111111111";
const gestor = "22222222-2222-4222-8222-222222222222";
const cliente = "44444444-4444-4444-8444-444444444444";
const outro = "55555555-5555-4555-8555-555555555555";
const semCompra = "66666666-6666-4666-8666-666666666666";
const sessaoDona = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sessaoGestor = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

async function como(papel, id, extra = {}) {
  await sql("reset role");
  const claims = JSON.stringify({
    sub: id || "",
    role: papel,
    aal: extra.aal || "aal2",
    session_id: extra.session_id || "",
  }).replaceAll("'", "''");
  await sql(`select set_config('request.jwt.claims', '${claims}', false)`);
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
    select (auth.jwt() ->> 'sub')::uuid
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
    ('${gestor}', 'gestor@exemplo.test', now(), now()),
    ('${cliente}', 'cliente@exemplo.test', now(), now()),
    ('${outro}', 'outro@exemplo.test', null, null),
    ('${semCompra}', 'sem-compra@exemplo.test', now(), null);
  insert into public.perfis (id, nome, email, papel, acesso_financeiro) values
    ('${dona}', 'Proprietária fictícia', 'dona@exemplo.test', 'owner', true),
    ('${gestor}', 'Administrador fictício', 'gestor@exemplo.test', 'admin', true),
    ('${cliente}', 'Cliente fictício', 'cliente@exemplo.test', 'cliente', false),
    ('${outro}', 'Outro cliente', 'outro@exemplo.test', 'cliente', false),
    ('${semCompra}', 'Cliente sem compra', 'sem-compra@exemplo.test', 'cliente', false);
  insert into auth.sessions (id, user_id) values
    ('${sessaoDona}', '${dona}'),
    ('${sessaoGestor}', '${gestor}');
  insert into public.pedidos (usuario_id, txid, titulo, valor) values
    ('${cliente}', 'PIXFICTICIO01', 'Material fictício', 4.90),
    ('${outro}', 'OUTROPEDIDO01', 'Outro material', 4.90);
  create table public.proprietaria (
    id integer primary key,
    usuario_id uuid not null
  );
  insert into public.proprietaria (id, usuario_id) values (1, '${dona}');
  create or replace function public.id_proprietaria()
  returns uuid language sql stable as $$
    select usuario_id from public.proprietaria where id = 1
  $$;
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
`);
await sql(arquivo("migracao-sessao-ativa.sql"));
await sql(arquivo("migracao-aal2-admin.sql"));
await sql(`
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant execute on function auth.jwt() to anon, authenticated;
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

await como("authenticated", dona, { aal: "aal1", session_id: sessaoDona });
assert.match(await falha("select * from public.listar_contas('', 20, 0)"), /Sem permissão/);
await sql(`update public.solicitacoes set status = 'resolvido' where id = '${chamado}'`);
await como("authenticated", dona, { aal: "aal2" });
assert.match(await falha("select * from public.listar_contas('', 20, 0)"), /Sem permissão/);

await como("authenticated", dona, { aal: "aal2", session_id: sessaoDona });
const contas = await linhas("select nome from public.listar_contas('', 20, 0)");
assert.equal(contas.some((item) => item.nome === "Cliente sem compra"), true);
const amostra = (await linhas("select * from public.listar_contas('', 20, 0)"))[0];
assert.deepEqual(Object.keys(amostra).sort(), ["acesso_financeiro", "criado_em", "email", "email_confirmado", "id", "nome", "papel", "ultimo_acesso"]);
assert.equal((await linhas(`select status from public.solicitacoes where id = '${chamado}'`))[0].status, "aberto");
assert.match(await falha(`
  update public.solicitacoes set txid = 'OUTROPEDIDO01' where id = '${chamado}';
`), /não pertence/);
await sql(`update public.solicitacoes set status = 'resolvido' where id = '${chamado}'`);
assert.equal((await linhas(`select status from public.solicitacoes where id = '${chamado}'`))[0].status, "resolvido");
assert.match(await falha(`
  update public.solicitacoes set usuario_id = '${dona}' where id = '${chamado}';
`), /dono do chamado/);

await como("postgres", "");
await sql(`
  create table public.cobrancas (
    id uuid primary key default gen_random_uuid(),
    txid text not null,
    status text not null,
    valor_bruto numeric not null
  );
  insert into public.cobrancas (txid, status, valor_bruto) values ('pedido-simulado', 'pago', 9.80);
`);
await como("authenticated", gestor, { aal: "aal2", session_id: sessaoGestor });
await sql(`
  insert into public.solicitacao_mensagens (solicitacao_id, autor_id, texto)
  values ('${chamado}', '${gestor}', 'Resposta da equipe fictícia.');
`);
assert.equal((await linhas(`select count(*)::int as total from public.solicitacao_mensagens where solicitacao_id = '${chamado}'`))[0].total, 2);
await como("postgres", "");
const cobranca = (await linhas("select status, valor_bruto::text as bruto from public.cobrancas"))[0];
assert.equal(cobranca.status, "pago");
assert.equal(cobranca.bruto, "9.80");
await como("authenticated", cliente);
const respostas = await linhas(`select texto from public.solicitacao_mensagens where solicitacao_id = '${chamado}' order by criado_em`);
assert.deepEqual(respostas.map((item) => item.texto), [
  "Não consegui baixar o arquivo fictício.",
  "Resposta da equipe fictícia.",
]);
await como("authenticated", outro);
assert.equal((await linhas(`select texto from public.solicitacao_mensagens where solicitacao_id = '${chamado}'`)).length, 0);
await como("authenticated", gestor, { aal: "aal1", session_id: sessaoGestor });
assert.match(await falha(`
  insert into public.solicitacao_mensagens (solicitacao_id, autor_id, texto)
  values ('${chamado}', '${gestor}', 'Resposta sem o segundo fator.');
`), /row-level security|policy/i);

await como("postgres", "");
await sql(arquivo("reverter-atendimento.sql"));
await como("authenticated", dona, { aal: "aal1", session_id: sessaoDona });
assert.equal((await linhas("select public.sou_admin() as ok"))[0].ok, false);
await como("authenticated", dona, { aal: "aal2", session_id: sessaoDona });
assert.equal((await linhas("select public.sou_admin() as ok"))[0].ok, true);
await como("authenticated", cliente);
assert.match(await falha("select * from public.solicitacoes"), /permission denied|permissão/i);
await como("postgres", "");
assert.equal((await linhas("select count(*)::int as total from public.solicitacoes"))[0].total, 1);
assert.equal((await linhas(`select count(*)::int as total from public.solicitacao_mensagens where solicitacao_id = '${chamado}'`))[0].total, 2);
assert.match(await falha("select * from public.listar_contas('', 20, 0)"), /listar_contas|does not exist|não exist/i);
await sql(arquivo("migracao-atendimento.sql"));
await como("authenticated", cliente);
assert.equal((await linhas(`select status from public.solicitacoes where id = '${chamado}'`))[0].status, "resolvido");
await como("postgres", "");

const texto = arquivo("migracao-atendimento.sql");
const reversao = arquivo("reverter-atendimento.sql");
assert.doesNotMatch(texto, /service_role|encrypted_password|raw_user_meta_data|ASAAS_API_KEY/i);
assert.match(texto, /NÃO execute este arquivo sem autorização/);
assert.doesNotMatch(reversao, /drop table/i);
assert.match(reversao, /conserva os chamados/);

console.log("ok central de ajuda isolada e reversão");
