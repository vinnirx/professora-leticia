import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migracao = readFileSync(new URL("../supabase/migracao-preco-tabuada.sql", import.meta.url), "utf8");
assert.match(migracao, /id = 'atividade-tabuada-de-pitagoras-com-apoio'/);
assert.match(migracao, /set preco = 5\.00/);
assert.match(migracao, /R\$ 4,90/);
assert.doesNotMatch(migracao, /update\s+public\.pedidos/i);
assert.doesNotMatch(migracao, /update\s+public\.cobrancas/i);
assert.doesNotMatch(migracao, /update\s+public\.direitos_acesso/i);

const db = new PGlite();
const comprador = "33333333-3333-4333-8333-333333333333";

await db.exec(`
  create table public.atividades (
    id text primary key,
    titulo text not null,
    preco numeric(10, 2) not null,
    arquivo text not null,
    arquivada_em timestamptz
  );
  create table public.pedidos (
    id uuid primary key default gen_random_uuid(),
    usuario_id uuid not null,
    atividade_id text not null,
    valor numeric(10, 2) not null,
    txid text not null,
    status text not null
  );
  create table public.direitos_acesso (
    usuario_id uuid not null,
    atividade_id text not null,
    revogado_em timestamptz,
    primary key (usuario_id, atividade_id)
  );
  create table public.cobrancas (
    txid text primary key,
    taxa numeric(10, 2),
    valor_liquido numeric(10, 2)
  );
  insert into public.atividades (id, titulo, preco, arquivo) values
    ('adicao', 'Adição', 9.90, 'adicao.pdf'),
    ('adicao-50', 'Adição 50', 9.90, 'adicao-50.pdf'),
    ('atividade-tabuada-de-pitagoras-com-apoio', 'Tabuada', 4.90, 'tabuada.pdf'),
    ('resolver-problemas', 'Resolver', 5.00, 'resolver.pdf'),
    ('silabas', 'Sílabas', 5.00, 'silabas.pdf');
  insert into public.atividades (id, titulo, preco, arquivo, arquivada_em) values
    ('celulas', 'Células', 5.00, 'celulas.pdf', now());
  insert into public.pedidos (usuario_id, atividade_id, valor, txid, status) values
    ('${comprador}', 'celulas', 4.90, '9d2daf094d', 'pago'),
    ('${comprador}', 'silabas', 4.90, '9d2daf094d', 'pago');
  insert into public.direitos_acesso (usuario_id, atividade_id) values
    ('${comprador}', 'celulas'),
    ('${comprador}', 'silabas');
  insert into public.cobrancas (txid, taxa, valor_liquido) values ('9d2daf094d', 0.79, 9.01);
`);

await db.exec(migracao);

const tabuada = (await db.query(
  "select preco::text as preco, arquivo, titulo from public.atividades where id = 'atividade-tabuada-de-pitagoras-com-apoio'",
)).rows[0];
assert.equal(tabuada.preco, "5.00");
assert.equal(tabuada.arquivo, "tabuada.pdf");
assert.equal(tabuada.titulo, "Tabuada");

const outras = await db.query("select id, preco::text as preco from public.atividades where id <> 'atividade-tabuada-de-pitagoras-com-apoio' order by id");
assert.deepEqual(outras.rows, [
  { id: "adicao", preco: "9.90" },
  { id: "adicao-50", preco: "9.90" },
  { id: "celulas", preco: "5.00" },
  { id: "resolver-problemas", preco: "5.00" },
  { id: "silabas", preco: "5.00" },
]);
const soma = await db.query("select sum(valor)::text as soma from public.pedidos where txid = '9d2daf094d'");
assert.equal(soma.rows[0].soma, "9.80");
const cobranca = await db.query("select taxa::text as taxa, valor_liquido::text as liquido from public.cobrancas where txid = '9d2daf094d'");
assert.deepEqual(cobranca.rows[0], { taxa: "0.79", liquido: "9.01" });

console.log("ok preco tabuada");
