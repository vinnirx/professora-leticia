import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const pagamentos = ler("../supabase/migracao-pagamentos.sql");
const bloqueio = ler("../supabase/migracao-bloquear-pedido-sem-cobranca.sql");
const reversao = ler("../supabase/reverter-bloquear-pedido-sem-cobranca.sql");

assert.match(bloqueio, /As compras ainda não estão abertas/);
assert.match(bloqueio, /create or replace function public\.criar_pedido/);
assert.match(bloqueio, /create or replace function public\.criar_pedidos/);
assert.doesNotMatch(bloqueio, /preparar_cobranca|delete from public\.pedidos|update public\.pedidos|direitos_acesso|VC97TPVUDR|9d2daf094d/i);
assert.match(reversao, /create or replace function public\.criar_pedido/);
assert.match(reversao, /arquivada_em is not null/);
assert.match(reversao, /item\.preco <= 0/);

function trecho(sql, inicio, fim) {
  const de = sql.indexOf(inicio);
  const ate = sql.indexOf(fim, de + inicio.length);
  assert.ok(de >= 0 && ate > de, inicio);
  return sql.slice(de, ate);
}

const cliente = "44444444-4444-4444-8444-444444444444";
const db = new PGlite();

async function sql(texto) {
  return db.exec(texto);
}

async function um(texto) {
  return (await db.query(texto)).rows[0];
}

async function falha(texto) {
  try {
    await sql(texto);
  } catch (erro) {
    return String(erro.message || erro);
  }
  throw new Error(`deveria falhar: ${texto.slice(0, 80)}`);
}

await sql(`
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create table public.atividades (
    id text primary key,
    titulo text not null,
    preco numeric(10, 2) not null check (preco > 0),
    arquivada_em timestamptz
  );
  create table public.pedidos (
    id uuid primary key default gen_random_uuid(),
    usuario_id uuid not null,
    atividade_id text not null references public.atividades (id),
    titulo text not null,
    valor numeric(10, 2) not null check (valor > 0),
    txid text not null,
    status text not null default 'aguardando',
    confirmacao text
  );
  create table public.cobrancas (
    id uuid primary key default gen_random_uuid(),
    usuario_id uuid not null,
    txid text not null,
    chave_idempotencia text not null,
    provedor text not null default 'asaas',
    cobranca_externa text,
    valor_bruto numeric(10, 2) not null check (valor_bruto > 0),
    taxa numeric(10, 2),
    valor_liquido numeric(10, 2),
    status text not null default 'criada',
    copia_cola text,
    expira_em timestamptz,
    unique (usuario_id, chave_idempotencia)
  );
  create table public.direitos_acesso (
    usuario_id uuid not null,
    atividade_id text not null,
    txid text not null,
    origem text not null,
    revogado_em timestamptz,
    primary key (usuario_id, atividade_id)
  );
  create or replace function public.impedir_compra_arquivada()
  returns trigger language plpgsql as $$
  declare
    retirada timestamptz;
  begin
    select arquivada_em into retirada from public.atividades where id = new.atividade_id;
    if not found or retirada is not null then
      raise exception 'Esta atividade não está mais à venda.';
    end if;
    return new;
  end;
  $$;
  create trigger impedir_compra_arquivada
  before insert on public.pedidos
  for each row execute function public.impedir_compra_arquivada();
  insert into public.atividades (id, titulo, preco) values
    ('adicao', 'Adição', 9.90),
    ('silabas', 'Sílabas', 5.00),
    ('celulas', 'Células', 4.90);
  insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid, status, confirmacao) values
    ('${cliente}', 'celulas', 'Células', 4.90, '9d2daf094d', 'pago', 'asaas'),
    ('${cliente}', 'silabas', 'Sílabas', 4.90, '9d2daf094d', 'pago', 'asaas'),
    ('${cliente}', 'adicao', 'Adição', 9.90, 'VC97TPVUDR', 'aguardando', null);
  insert into public.direitos_acesso (usuario_id, atividade_id, txid, origem) values
    ('${cliente}', 'celulas', '9d2daf094d', 'compra'),
    ('${cliente}', 'silabas', '9d2daf094d', 'compra');
  update public.atividades set arquivada_em = now() where id = 'celulas';
`);
await sql("select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', false)");
await sql(trecho(pagamentos, "create or replace function public.preparar_cobranca", "create or replace function public.desfazer_cobranca_sem_pix"));

const aberta = await um("select public.preparar_cobranca(array['adicao'], 'chave-teste-01') as resultado");
assert.equal(aberta.resultado.ok, true);
assert.equal(Number(aberta.resultado.valor_bruto), 9.9);
const linha = await um(`select valor::numeric as valor, status from public.pedidos where txid = '${aberta.resultado.txid}'`);
assert.equal(Number(linha.valor), 9.9);
assert.equal(linha.status, "aguardando");
assert.match(await falha("select public.preparar_cobranca(array['celulas'], 'chave-arquivada')"), /não está mais à venda/);
assert.match(await falha("insert into public.atividades (id, titulo, preco) values ('gratis', 'Grátis', 0)"), /check|preco/i);

await sql(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  end $$;
`);
await sql(bloqueio);
assert.match(await falha("select public.criar_pedido('adicao', 'SEMCOBRA1')"), /As compras ainda não estão abertas/);
assert.match(await falha("select public.criar_pedidos(array['adicao'], 'SEMCOBRA2')"), /As compras ainda não estão abertas/);
const depois = await um("select public.preparar_cobranca(array['silabas'], 'chave-teste-02') as resultado");
assert.equal(depois.resultado.ok, true);
assert.equal(Number(depois.resultado.valor_bruto), 5);

const historico = await db.query("select txid, atividade_id, valor::numeric as valor, status, confirmacao from public.pedidos where txid in ('9d2daf094d', 'VC97TPVUDR') order by txid, atividade_id");
assert.deepEqual(historico.rows.map((item) => ({
  txid: item.txid,
  atividade: item.atividade_id,
  valor: Number(item.valor),
  status: item.status,
  confirmacao: item.confirmacao,
})), [
  { txid: "9d2daf094d", atividade: "celulas", valor: 4.9, status: "pago", confirmacao: "asaas" },
  { txid: "9d2daf094d", atividade: "silabas", valor: 4.9, status: "pago", confirmacao: "asaas" },
  { txid: "VC97TPVUDR", atividade: "adicao", valor: 9.9, status: "aguardando", confirmacao: null },
]);
assert.equal(Number((await um("select count(*)::int as total from public.direitos_acesso where revogado_em is null")).total), 2);

await sql(reversao.replace("notify pgrst, 'reload schema';", ""));
await sql("select public.criar_pedido('adicao', 'DEPOISREV1')");
const voltou = await um("select valor::numeric as valor, status from public.pedidos where txid = 'DEPOISREV1'");
assert.equal(Number(voltou.valor), 9.9);
assert.equal(voltou.status, "aguardando");
assert.equal((await um("select status, confirmacao from public.pedidos where txid = '9d2daf094d' limit 1")).status, "pago");

console.log("ok bloqueio isolado preserva cobrança automática e pedidos históricos");
