import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const proposta = readFileSync(new URL("../supabase/proposta-confirmacao-financeira.sql", import.meta.url), "utf8");
const reversao = readFileSync(new URL("../supabase/reverter-confirmacao-financeira.sql", import.meta.url), "utf8");

const corpo = proposta.slice(proposta.indexOf("as $$"), proposta.lastIndexOf("$$"));
assert.match(proposta, /A confirmação manual não está disponível/);
assert.doesNotMatch(corpo, /update\s+public\.pedidos|insert into public\.direitos_acesso|processar_evento_asaas/i);
assert.match(reversao, /confirmacao = 'admin'/);
assert.match(reversao, /revogado_em = null/);

const dona = "11111111-1111-4111-8111-111111111111";
const gestor = "22222222-2222-4222-8222-222222222222";
const cliente = "33333333-3333-4333-8333-333333333333";
const sessaoDona = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sessaoGestor = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sessaoCliente = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const db = new PGlite();

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
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
  create or replace function auth.role() returns text
  language sql stable as $$
    select coalesce(auth.jwt() ->> 'role', 'anon')
  $$;
  create table public.perfis (
    id uuid primary key,
    papel text not null
  );
  create table public.proprietaria (
    id integer primary key,
    usuario_id uuid not null
  );
  create table public.atividades (
    id text primary key,
    preco numeric(10, 2) not null
  );
  create table public.pedidos (
    id uuid primary key default gen_random_uuid(),
    usuario_id uuid not null,
    atividade_id text not null,
    valor numeric(10, 2) not null,
    txid text not null,
    status text not null default 'aguardando',
    confirmacao text,
    confirmado_por uuid,
    confirmado_em timestamptz
  );
  create table public.cobrancas (
    id uuid primary key default gen_random_uuid(),
    usuario_id uuid not null,
    txid text not null,
    provedor text not null default 'asaas',
    cobranca_externa text,
    status text not null,
    valor_bruto numeric(10, 2) not null
  );
  create table public.direitos_acesso (
    usuario_id uuid not null,
    atividade_id text not null,
    txid text,
    origem text,
    revogado_em timestamptz,
    concedido_em timestamptz not null default now(),
    primary key (usuario_id, atividade_id)
  );
  create table public.eventos_pagamento (
    id uuid primary key default gen_random_uuid(),
    evento_externo text not null unique,
    cobranca_id uuid not null,
    tipo text not null,
    valor numeric(10, 2),
    taxa numeric(10, 2),
    liquido numeric(10, 2),
    resultado text not null,
    detalhe text not null default ''
  );
  create table public.comprovantes_servidor (
    id uuid primary key,
    txid text not null,
    usuario_id uuid not null,
    valor numeric(10, 2) not null,
    origem text not null
  );
  revoke all on public.comprovantes_servidor from public, anon, authenticated;
  grant insert, select on public.comprovantes_servidor to service_role;
  insert into public.perfis (id, papel) values
    ('${dona}', 'owner'),
    ('${gestor}', 'admin'),
    ('${cliente}', 'cliente');
  insert into public.proprietaria (id, usuario_id) values (1, '${dona}');
  insert into auth.sessions (id, user_id) values
    ('${sessaoDona}', '${dona}'),
    ('${sessaoGestor}', '${gestor}'),
    ('${sessaoCliente}', '${cliente}');
  insert into public.atividades (id, preco) values
    ('material-asaas', 5.00),
    ('material-manual', 5.00),
    ('material-divergente', 5.00),
    ('material-futuro', 5.00),
    ('material-bloqueado', 5.00);
`);

await db.exec(`
  create or replace function public.id_proprietaria()
  returns uuid language sql stable security definer set search_path = public as $$
    select usuario_id from public.proprietaria where id = 1
  $$;
  create or replace function public.sessao_ainda_valida()
  returns boolean language sql stable security definer set search_path = public as $$
    select exists (
      select 1 from auth.sessions
      where id = nullif(auth.jwt() ->> 'session_id', '')::uuid
        and user_id = auth.uid()
        and not_after is null
    )
  $$;
  create or replace function public.sou_admin()
  returns boolean language sql stable security definer set search_path = public as $$
    select exists (
      select 1 from public.perfis
      where id = auth.uid() and papel in ('admin', 'super_admin', 'owner')
    ) and public.sessao_ainda_valida()
  $$;
  create or replace function public.motivo_proprietaria()
  returns text language plpgsql stable security definer set search_path = public as $$
  begin
    if auth.uid() is null or auth.uid() is distinct from public.id_proprietaria() then
      return 'Sem permissão.';
    end if;
    if coalesce(auth.jwt() ->> 'aal', '') is distinct from 'aal2' then
      return 'Confirme o segundo fator para continuar.';
    end if;
    if not public.sessao_ainda_valida() then
      return 'Esta sessão não está mais ativa.';
    end if;
    return '';
  end $$;
`);

await db.exec(reversao.replaceAll("notify pgrst, 'reload schema';", ""));

async function entrar({ sub, aal, session_id, role = "authenticated" }) {
  const claims = JSON.stringify({ sub, aal, session_id, role }).replaceAll("'", "''");
  await db.exec(`select set_config('request.jwt.claims', '${claims}', false)`);
}

async function erro(sql) {
  try {
    await db.exec(sql);
    return "";
  } catch (falha) {
    return String(falha?.message || falha);
  }
}

async function pedido(txid) {
  const linha = (await db.query(
    "select status, confirmacao, valor::text as valor from public.pedidos where txid = $1",
    [txid],
  )).rows[0];
  const direitos = (await db.query(
    "select count(*)::int as total, count(*) filter (where revogado_em is null)::int as ativos from public.direitos_acesso d join public.pedidos p on p.usuario_id = d.usuario_id and p.atividade_id = d.atividade_id where p.txid = $1",
    [txid],
  )).rows[0];
  return { ...linha, direitos: direitos.total, ativos: direitos.ativos };
}

const asaas = (await db.query(
  `insert into public.pedidos (usuario_id, atividade_id, valor, txid, status)
   values ('${cliente}', 'material-asaas', 5.00, 'asaas-novo', 'aguardando')
   returning id`,
)).rows[0].id;
await db.exec(
  `insert into public.cobrancas (usuario_id, txid, cobranca_externa, status, valor_bruto)
   values ('${cliente}', 'asaas-novo', 'pay_teste', 'pendente', 5.00)`,
);

const manual = (await db.query(
  `insert into public.pedidos (usuario_id, atividade_id, valor, txid, status)
   values ('${cliente}', 'material-manual', 5.00, 'manual-revogado', 'aguardando')
   returning id`,
)).rows[0].id;
await db.exec(
  `insert into public.direitos_acesso (usuario_id, atividade_id, txid, origem, revogado_em)
   values ('${cliente}', 'material-manual', 'manual-revogado', 'compra', now())`,
);

await entrar({ sub: cliente, aal: "aal1", session_id: sessaoCliente });
assert.match(await erro(`select public.confirmar_pix('${asaas}')`), /Sem permissão/);
assert.equal((await pedido("asaas-novo")).status, "aguardando");

await entrar({ sub: gestor, aal: "aal1", session_id: sessaoGestor });
await db.exec(`select public.confirmar_pix('${manual}')`);
const reativado = await pedido("manual-revogado");
assert.equal(reativado.status, "pago");
assert.equal(reativado.confirmacao, "admin");
assert.equal(reativado.ativos, 1);

await db.exec(proposta.replaceAll("notify pgrst, 'reload schema';", ""));

await entrar({ sub: gestor, aal: "aal1", session_id: sessaoGestor });
assert.match(await erro(`select public.confirmar_pix('${asaas}')`), /não está disponível/);
assert.equal((await pedido("asaas-novo")).status, "aguardando");
assert.equal((await pedido("asaas-novo")).ativos, 0);
assert.match(await erro(`select public.confirmar_pix('${asaas}')`), /não está disponível/);
assert.equal((await pedido("asaas-novo")).status, "aguardando");

await entrar({ sub: dona, aal: "aal2", session_id: sessaoDona });
assert.match(await erro(`select public.confirmar_pix('${asaas}')`), /não está disponível/);
assert.equal((await pedido("asaas-novo")).status, "aguardando");

await entrar({ sub: dona, aal: "aal1", session_id: sessaoDona });
const fotoAsaas = await pedido("asaas-novo");
assert.match(await erro(`select public.confirmar_pix('${asaas}')`), /não está disponível/);
assert.deepEqual(await pedido("asaas-novo"), fotoAsaas);

await db.exec(`
  insert into public.atividades (id, preco) values ('material-preservado', 5.00), ('material-antigo', 4.90);
  insert into public.pedidos (usuario_id, atividade_id, valor, txid, status)
  values ('${cliente}', 'material-preservado', 5.00, 'direito-revogado', 'aguardando');
  insert into public.direitos_acesso (usuario_id, atividade_id, txid, origem, revogado_em)
  values ('${cliente}', 'material-preservado', 'direito-revogado', 'compra', now());
  insert into public.pedidos (usuario_id, atividade_id, valor, txid, status, confirmacao)
  values ('${cliente}', 'material-antigo', 4.90, 'pedido-antigo', 'pago', 'asaas');
  insert into public.direitos_acesso (usuario_id, atividade_id, txid, origem)
  values ('${cliente}', 'material-antigo', 'pedido-antigo', 'compra');
`);
const revogadoId = (await db.query("select id from public.pedidos where txid = 'direito-revogado'")).rows[0].id;
const antigoId = (await db.query("select id from public.pedidos where txid = 'pedido-antigo'")).rows[0].id;
const fotoRevogado = await pedido("direito-revogado");
const fotoAntigo = await pedido("pedido-antigo");
for (const perfil of [
  { sub: cliente, aal: "aal1", session_id: sessaoCliente, pedidoId: revogadoId, mensagem: /Sem permissão/ },
  { sub: gestor, aal: "aal1", session_id: sessaoGestor, pedidoId: revogadoId, mensagem: /não está disponível/ },
  { sub: dona, aal: "aal1", session_id: sessaoDona, pedidoId: revogadoId, mensagem: /não está disponível/ },
  { sub: dona, aal: "aal2", session_id: sessaoDona, pedidoId: antigoId, mensagem: /não está disponível/ },
]) {
  await entrar(perfil);
  assert.match(await erro(`select public.confirmar_pix('${perfil.pedidoId}')`), perfil.mensagem);
}
assert.deepEqual(await pedido("direito-revogado"), fotoRevogado);
assert.equal((await db.query(
  "select revogado_em is not null as revogado from public.direitos_acesso where atividade_id = 'material-preservado'",
)).rows[0].revogado, true);
assert.deepEqual(await pedido("pedido-antigo"), fotoAntigo);

await db.exec(`
  create or replace function public.processar_evento_asaas(evento_externo text)
  returns jsonb language plpgsql security definer set search_path = public as $$
  declare
    evento public.eventos_pagamento;
    alvo public.cobrancas;
    desfecho text := 'ignorado';
  begin
    if coalesce(auth.role(), '') is distinct from 'service_role' then
      raise exception 'Sem permissão.';
    end if;
    select * into evento from public.eventos_pagamento where eventos_pagamento.evento_externo = trim(processar_evento_asaas.evento_externo);
    if not found then
      return jsonb_build_object('ok', false);
    end if;
    if evento.resultado not in ('recebido', 'falhou') then
      return jsonb_build_object('ok', true, 'repetido', true, 'resultado', evento.resultado);
    end if;
    select * into alvo from public.cobrancas where id = evento.cobranca_id;
    if evento.tipo = 'PAYMENT_RECEIVED' then
      if alvo.status = 'pago' then
        desfecho := 'repetido';
      elsif round(evento.valor * 100) <> round(alvo.valor_bruto * 100) then
        update public.cobrancas set status = 'analise' where id = alvo.id;
        desfecho := 'analise';
      else
        update public.cobrancas set status = 'pago' where id = alvo.id;
        update public.pedidos
        set status = 'pago', confirmacao = 'asaas'
        where usuario_id = alvo.usuario_id and txid = alvo.txid and status = 'aguardando';
        insert into public.direitos_acesso (usuario_id, atividade_id, txid, origem)
        select usuario_id, atividade_id, txid, 'compra'
        from public.pedidos
        where usuario_id = alvo.usuario_id and txid = alvo.txid and status = 'pago'
        on conflict (usuario_id, atividade_id) do update
        set txid = excluded.txid, origem = 'compra', revogado_em = null, concedido_em = now();
        desfecho := 'pago';
      end if;
    end if;
    update public.eventos_pagamento set resultado = desfecho where id = evento.id;
    return jsonb_build_object('ok', true, 'resultado', desfecho);
  end $$;
`);

const cobranca = (await db.query("select id from public.cobrancas where txid = 'asaas-novo'")).rows[0].id;
await db.exec(
  `insert into public.eventos_pagamento (evento_externo, cobranca_id, tipo, valor, resultado)
   values ('evt-legitimo', '${cobranca}', 'PAYMENT_RECEIVED', 5.00, 'recebido')`,
);
await entrar({ sub: null, aal: null, session_id: null, role: "service_role" });
const pago = await db.query("select public.processar_evento_asaas('evt-legitimo') as resultado");
assert.equal(pago.rows[0].resultado.resultado, "pago");
assert.equal((await pedido("asaas-novo")).status, "pago");
assert.equal((await pedido("asaas-novo")).confirmacao, "asaas");
assert.equal((await pedido("asaas-novo")).ativos, 1);
const repetido = await db.query("select public.processar_evento_asaas('evt-legitimo') as resultado");
assert.equal(repetido.rows[0].resultado.repetido, true);
assert.equal(repetido.rows[0].resultado.resultado, "pago");
assert.equal((await pedido("asaas-novo")).ativos, 1);

const divergente = (await db.query(
  `insert into public.pedidos (usuario_id, atividade_id, valor, txid)
   values ('${cliente}', 'material-divergente', 5.00, 'asaas-divergente') returning id`,
)).rows[0].id;
const cobrancaDivergente = (await db.query(
  `insert into public.cobrancas (usuario_id, txid, cobranca_externa, status, valor_bruto)
   values ('${cliente}', 'asaas-divergente', 'pay_divergente', 'pendente', 5.00) returning id`,
)).rows[0].id;
await db.exec(
  `insert into public.eventos_pagamento (evento_externo, cobranca_id, tipo, valor, resultado)
   values ('evt-divergente', '${cobrancaDivergente}', 'PAYMENT_RECEIVED', 4.90, 'recebido')`,
);
const analise = await db.query("select public.processar_evento_asaas('evt-divergente') as resultado");
assert.equal(analise.rows[0].resultado.resultado, "analise");
assert.equal((await pedido("asaas-divergente")).status, "aguardando");
assert.equal((await pedido("asaas-divergente")).ativos, 0);
assert.equal(divergente.length > 0, true);

await db.exec(`
  create or replace function public.confirmar_com_prova(pedido uuid, comprovante uuid)
  returns void language plpgsql security definer set search_path = public as $$
  declare
    alvo public.pedidos;
    prova public.comprovantes_servidor;
    soma numeric;
  begin
    if public.motivo_proprietaria() <> '' then
      raise exception '%', public.motivo_proprietaria();
    end if;
    select * into alvo from public.pedidos where id = pedido;
    if not found then
      raise exception 'Pedido não encontrado.';
    end if;
    if exists (
      select 1 from public.pedidos
      where txid = alvo.txid and usuario_id = alvo.usuario_id and status = 'pago'
    ) then
      return;
    end if;
    if exists (
      select 1 from public.cobrancas
      where txid = alvo.txid and usuario_id = alvo.usuario_id
    ) then
      raise exception 'Cobrança do Asaas só é confirmada pelo webhook.';
    end if;
    if exists (
      select 1 from public.direitos_acesso d
      join public.pedidos p on p.usuario_id = d.usuario_id and p.atividade_id = d.atividade_id
      where p.txid = alvo.txid and p.usuario_id = alvo.usuario_id and d.revogado_em is not null
    ) then
      raise exception 'Há um download revogado. A confirmação manual não reativa esse direito.';
    end if;
    select * into prova from public.comprovantes_servidor where id = comprovante;
    if not found or prova.txid is distinct from alvo.txid or prova.usuario_id is distinct from alvo.usuario_id then
      raise exception 'Não há comprovação registrada pelo servidor.';
    end if;
    select coalesce(sum(valor), 0) into soma
    from public.pedidos
    where txid = alvo.txid and usuario_id = alvo.usuario_id and status = 'aguardando';
    if soma is distinct from prova.valor then
      raise exception 'O valor comprovado não confere com o pedido.';
    end if;
    update public.pedidos
    set status = 'pago', confirmacao = prova.origem, confirmado_por = auth.uid(), confirmado_em = now()
    where txid = alvo.txid and usuario_id = alvo.usuario_id and status = 'aguardando';
    insert into public.direitos_acesso (usuario_id, atividade_id, txid, origem)
    select usuario_id, atividade_id, txid, 'compra'
    from public.pedidos
    where txid = alvo.txid and usuario_id = alvo.usuario_id and status = 'pago'
    on conflict (usuario_id, atividade_id) do nothing;
  end $$;
`);

const historico = (await db.query(
  `insert into public.pedidos (usuario_id, atividade_id, valor, txid, status)
   values ('${cliente}', 'material-futuro', 5.00, 'manual-futuro', 'aguardando') returning id`,
)).rows[0].id;
const provaId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
await entrar({ sub: cliente, aal: "aal1", session_id: sessaoCliente });
await db.exec("set role authenticated");
assert.match(await erro(
  `insert into public.comprovantes_servidor (id, txid, usuario_id, valor, origem)
   values ('${provaId}', 'manual-futuro', '${cliente}', 5.00, 'comprovante_servidor')`,
), /permission denied/);
await db.exec("reset role");

await entrar({ sub: dona, aal: "aal1", session_id: sessaoDona });
assert.match(await erro(`select public.confirmar_com_prova('${historico}', '${provaId}')`), /segundo fator/);
await entrar({ sub: gestor, aal: "aal2", session_id: sessaoGestor });
assert.match(await erro(`select public.confirmar_com_prova('${historico}', '${provaId}')`), /Sem permissão/);
await entrar({ sub: dona, aal: "aal2", session_id: sessaoDona });
assert.match(await erro(`select public.confirmar_com_prova('${historico}', '${provaId}')`), /Não há comprovação/);
assert.equal((await pedido("manual-futuro")).status, "aguardando");

await db.exec("reset role");
await db.exec(
  `insert into public.comprovantes_servidor (id, txid, usuario_id, valor, origem)
   values ('${provaId}', 'manual-futuro', '${cliente}', 4.90, 'comprovante_servidor')`,
);
await entrar({ sub: dona, aal: "aal2", session_id: sessaoDona });
assert.match(await erro(`select public.confirmar_com_prova('${historico}', '${provaId}')`), /não confere/);
await db.exec(`update public.comprovantes_servidor set valor = 5.00 where id = '${provaId}'`);
await db.exec(`select public.confirmar_com_prova('${historico}', '${provaId}')`);
const confirmado = (await db.query(
  "select status, confirmacao, confirmado_por::text as confirmado_por, confirmado_em from public.pedidos where txid = 'manual-futuro'",
)).rows[0];
assert.equal(confirmado.status, "pago");
assert.equal(confirmado.confirmacao, "comprovante_servidor");
assert.equal(confirmado.confirmado_por, dona);
assert.ok(confirmado.confirmado_em);
await db.exec(`select public.confirmar_com_prova('${historico}', '${provaId}')`);
const deNovo = (await db.query("select confirmado_em from public.pedidos where txid = 'manual-futuro'")).rows[0];
assert.equal(new Date(deNovo.confirmado_em).toISOString(), new Date(confirmado.confirmado_em).toISOString());

const asaasAberto = (await db.query(
  `insert into public.pedidos (usuario_id, atividade_id, valor, txid)
   values ('${cliente}', 'material-asaas', 5.00, 'asaas-aberto') returning id`,
)).rows[0].id;
await db.exec(
  `insert into public.cobrancas (usuario_id, txid, cobranca_externa, status, valor_bruto)
   values ('${cliente}', 'asaas-aberto', 'pay_aberto', 'pendente', 5.00)`,
);
assert.match(await erro(`select public.confirmar_com_prova('${asaasAberto}', '${provaId}')`), /Asaas/);
assert.equal((await pedido("asaas-aberto")).status, "aguardando");
assert.equal((await pedido("asaas-novo")).confirmacao, "asaas");

const revogado = (await db.query(
  `insert into public.pedidos (usuario_id, atividade_id, valor, txid)
   values ('${cliente}', 'material-bloqueado', 5.00, 'manual-bloqueado') returning id`,
)).rows[0].id;
await db.exec(
  `insert into public.direitos_acesso (usuario_id, atividade_id, txid, origem, revogado_em)
   values ('${cliente}', 'material-bloqueado', 'manual-bloqueado', 'compra', now())`,
);
const provaRevogada = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
await db.exec("set role service_role");
await db.exec(
  `insert into public.comprovantes_servidor (id, txid, usuario_id, valor, origem)
   values ('${provaRevogada}', 'manual-bloqueado', '${cliente}', 5.00, 'comprovante_servidor')`,
);
await db.exec("reset role");
assert.match(await erro(`select public.confirmar_com_prova('${revogado}', '${provaRevogada}')`), /não reativa/);
assert.equal((await pedido("manual-bloqueado")).status, "aguardando");
const revogacao = (await db.query(
  "select revogado_em is not null as revogado from public.direitos_acesso where usuario_id = $1 and atividade_id = 'material-bloqueado'",
  [cliente],
)).rows[0];
assert.equal(revogacao.revogado, true);

const admin = readFileSync(new URL("../js/conta/admin.js", import.meta.url), "utf8");
const painel = readFileSync(new URL("../gerenciar/index.html", import.meta.url), "utf8");
assert.doesNotMatch(admin, /Confirmar Pix/);
assert.match(admin, /Pedido pendente permanece aguardando/);
assert.match(admin, /return \["Aguardando", "espera"\]/);
assert.match(admin, /celula\("Status", selo\(\.\.\.rotuloStatus\(grupo\.status\)\)\)/);
assert.match(painel, /conta\.js\?v=69/);

console.log("ok confirmacao financeira");
