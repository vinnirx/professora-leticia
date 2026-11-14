begin;

-- Cole este arquivo inteiro no SQL Editor do Supabase e rode uma vez, só quando autorizar.
-- Não rode o esquema.sql de novo. Não rode esta migração pelo site.
-- Ela não apaga pedido, usuário, PDF nem venda paga.
-- Pedido antigo pago continua baixável até a proprietária conciliar e encerrar a exceção.
-- O SQL Editor não tem a sessão da Letícia: auth.uid() fica vazio e a conciliação recusa.
-- A conciliação é no painel, com a conta OWNER, um código por vez e confirmação explícita.
-- listar_conciliacao, conciliar_pedido e encerrar_conciliacao recusam cliente, admin e super admin.
-- Não rode supabase/migracao-downloads-finais.sql neste momento.
-- Sem a chave do Asaas, nada aqui gera cobrança.

alter table public.pedidos drop constraint if exists pedidos_txid_key;
drop index if exists public.pedidos_txid_key;

create unique index if not exists pedidos_usuario_txid_atividade
  on public.pedidos (usuario_id, txid, atividade_id);

alter table public.pedidos drop constraint if exists pedidos_status_check;
alter table public.pedidos
  add constraint pedidos_status_check
  check (status in ('aguardando', 'pago', 'estornado', 'cancelado'));

alter table public.pedidos add column if not exists confirmacao text;
alter table public.pedidos drop constraint if exists pedidos_confirmacao_check;
alter table public.pedidos
  add constraint pedidos_confirmacao_check
  check (confirmacao is null or confirmacao in ('admin', 'asaas', 'legado_conferido'));

alter table public.pedidos add column if not exists legado boolean not null default false;

create table if not exists public.direitos_acesso (
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  atividade_id text not null references public.atividades (id),
  txid text not null,
  origem text not null check (origem in ('compra', 'cortesia')),
  concedido_em timestamptz not null default now(),
  revogado_em timestamptz,
  primary key (usuario_id, atividade_id)
);

create table if not exists public.cobrancas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  txid text not null,
  chave_idempotencia text not null,
  provedor text not null default 'asaas',
  cobranca_externa text,
  valor_bruto numeric(10, 2) not null check (valor_bruto > 0),
  taxa numeric(10, 2),
  valor_liquido numeric(10, 2),
  status text not null default 'criada'
    check (status in ('criada', 'pendente', 'pago', 'expirada', 'cancelada', 'estornada', 'analise')),
  copia_cola text,
  expira_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (usuario_id, chave_idempotencia)
);

create unique index if not exists cobrancas_externa_unica
  on public.cobrancas (provedor, cobranca_externa)
  where cobranca_externa is not null;

create table if not exists public.eventos_pagamento (
  id uuid primary key default gen_random_uuid(),
  evento_externo text not null unique,
  cobranca_id uuid references public.cobrancas (id),
  tipo text not null,
  valor numeric(10, 2),
  resultado text not null,
  detalhe text not null default '',
  taxa numeric(10, 2),
  liquido numeric(10, 2),
  recebido_em timestamptz not null default now()
);

create table if not exists public.controle_conciliacao (
  id integer primary key check (id = 1),
  aberta boolean not null default true,
  encerrada_em timestamptz,
  encerrada_por uuid
);

insert into public.controle_conciliacao (id, aberta)
values (1, true)
on conflict (id) do nothing;

create table if not exists public.auditoria_conciliacao (
  id bigint generated always as identity primary key,
  conciliado_por uuid not null,
  txid text not null,
  quantidade integer not null,
  criado_em timestamptz not null default now()
);

alter table public.direitos_acesso enable row level security;
alter table public.cobrancas enable row level security;
alter table public.eventos_pagamento enable row level security;
alter table public.controle_conciliacao enable row level security;
alter table public.auditoria_conciliacao enable row level security;
revoke all on public.direitos_acesso from anon, authenticated;
revoke all on public.cobrancas from anon, authenticated;
revoke all on public.controle_conciliacao from anon, authenticated;
revoke all on public.auditoria_conciliacao from anon, authenticated;
grant select (
  id,
  usuario_id,
  txid,
  valor_bruto,
  taxa,
  valor_liquido,
  status,
  cobranca_externa,
  expira_em,
  criado_em,
  atualizado_em
) on public.cobrancas to authenticated;
revoke all on public.eventos_pagamento from anon, authenticated;

create or replace function public.pode_ver_financeiro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid()
      and (
        papel in ('owner', 'super_admin')
        or (papel = 'admin' and acesso_financeiro)
      )
  );
$$;

create or replace function public.pode_baixar(atividade text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.sou_admin()
    or exists (
      select 1 from public.direitos_acesso
      where usuario_id = auth.uid()
        and atividade_id = atividade
        and revogado_em is null
    )
    or exists (
      select 1
      from public.controle_conciliacao as controle
      join public.pedidos as pedido on true
      where controle.id = 1
        and controle.aberta
        and pedido.usuario_id = auth.uid()
        and pedido.atividade_id = atividade
        and pedido.status = 'pago'
        and pedido.confirmacao is null
        and pedido.legado
    );
$$;

create or replace function public.preparar_cobranca(atividades text[], chave text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
declare
  autor uuid := auth.uid();
  codigo text;
  total numeric(10, 2) := 0;
  item public.atividades;
  existente public.cobrancas;
  nova uuid;
begin
  if autor is null then
    raise exception 'Entre na conta para comprar.';
  end if;
  if chave is null or length(trim(chave)) < 8 or length(trim(chave)) > 80 then
    raise exception 'Pedido inválido.';
  end if;
  if atividades is null or cardinality(atividades) < 1 or cardinality(atividades) > 12 then
    raise exception 'O carrinho está vazio.';
  end if;
  if (select count(distinct id) from unnest(atividades) as pedido(id)) <> cardinality(atividades) then
    raise exception 'Pedido inválido.';
  end if;
  if (select count(*) from public.atividades where id = any(atividades)) <> cardinality(atividades) then
    raise exception 'Atividade indisponível.';
  end if;

  perform pg_advisory_xact_lock(hashtext(autor::text || ':' || trim(chave)));

  select * into existente
  from public.cobrancas
  where usuario_id = autor and chave_idempotencia = trim(chave);
  if found then
    return jsonb_build_object(
      'ok', true,
      'repetida', true,
      'cobranca_id', existente.id,
      'txid', existente.txid,
      'valor_bruto', existente.valor_bruto,
      'status', existente.status,
      'copia_cola', existente.copia_cola,
      'expira_em', existente.expira_em,
      'cobranca_externa', existente.cobranca_externa
    );
  end if;

  codigo := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  for item in
    select * from public.atividades where id = any(atividades) order by id
  loop
    insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid)
    values (autor, item.id, item.titulo, item.preco, codigo);
    total := total + item.preco;
  end loop;

  insert into public.cobrancas (usuario_id, txid, chave_idempotencia, valor_bruto)
  values (autor, codigo, trim(chave), total)
  returning id into nova;

  return jsonb_build_object(
    'ok', true,
    'repetida', false,
    'cobranca_id', nova,
    'txid', codigo,
    'valor_bruto', total,
    'status', 'criada'
  );
exception
  when unique_violation then
    select * into existente
    from public.cobrancas
    where usuario_id = autor and chave_idempotencia = trim(chave);
    if not found then
      raise exception 'Não foi possível abrir a cobrança.';
    end if;
    return jsonb_build_object(
      'ok', true,
      'repetida', true,
      'cobranca_id', existente.id,
      'txid', existente.txid,
      'valor_bruto', existente.valor_bruto,
      'status', existente.status,
      'copia_cola', existente.copia_cola,
      'expira_em', existente.expira_em,
      'cobranca_externa', existente.cobranca_externa
    );
end;
$$;

create or replace function public.desfazer_cobranca_sem_pix(cobranca uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo public.cobrancas;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'Sem permissão.';
  end if;
  select * into alvo from public.cobrancas where id = cobranca;
  if not found then
    return;
  end if;
  if alvo.cobranca_externa is not null or alvo.status is distinct from 'criada' then
    raise exception 'Esta cobrança já saiu para o Asaas.';
  end if;
  if exists (
    select 1 from public.pedidos
    where usuario_id = alvo.usuario_id
      and txid = alvo.txid
      and status is distinct from 'aguardando'
  ) then
    raise exception 'O pedido já mudou de situação.';
  end if;
  delete from public.pedidos
  where usuario_id = alvo.usuario_id and txid = alvo.txid and status = 'aguardando';
  delete from public.cobrancas where id = alvo.id;
end;
$$;

create or replace function public.gravar_pix_cobranca(
  cobranca uuid,
  externa text,
  codigo_pix text,
  expira timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo public.cobrancas;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'Sem permissão.';
  end if;
  if externa is null then
    raise exception 'Pix incompleto.';
  end if;
  select * into alvo from public.cobrancas where id = cobranca for update;
  if not found then
    raise exception 'Cobrança não encontrada.';
  end if;
  if alvo.cobranca_externa is not null and alvo.cobranca_externa is distinct from externa then
    raise exception 'A cobrança já tem outro identificador.';
  end if;
  update public.cobrancas
  set
    cobranca_externa = externa,
    copia_cola = coalesce(codigo_pix, copia_cola),
    expira_em = coalesce(expira, expira_em),
    status = case when status = 'criada' then 'pendente' else status end,
    atualizado_em = now()
  where id = alvo.id
  returning * into alvo;
  return jsonb_build_object(
    'ok', true,
    'txid', alvo.txid,
    'valor_bruto', alvo.valor_bruto,
    'status', alvo.status,
    'copia_cola', alvo.copia_cola,
    'expira_em', alvo.expira_em
  );
end;
$$;

create or replace function public.receber_evento_asaas(
  evento_externo text,
  tipo text,
  cobranca_externa text,
  valor_recebido numeric,
  taxa_recebida numeric,
  liquido_recebido numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  existente public.eventos_pagamento;
  alvo_id uuid;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'Sem permissão.';
  end if;
  if evento_externo is null or length(trim(evento_externo)) < 4 or tipo is null or cobranca_externa is null then
    raise exception 'Evento incompleto.';
  end if;

  select * into existente
  from public.eventos_pagamento as registro
  where registro.evento_externo = trim(receber_evento_asaas.evento_externo);
  if found and existente.resultado not in ('recebido', 'falhou') then
    return jsonb_build_object('ok', true, 'repetido', true, 'resultado', existente.resultado);
  end if;
  if found then
    return jsonb_build_object('ok', true, 'processar', true);
  end if;

  select id into alvo_id
  from public.cobrancas as cobranca
  where cobranca.provedor = 'asaas' and cobranca.cobranca_externa = receber_evento_asaas.cobranca_externa;
  if alvo_id is null then
    return jsonb_build_object('ok', false, 'repetir', true, 'mensagem', 'Cobrança ainda não registrada.');
  end if;

  insert into public.eventos_pagamento (evento_externo, cobranca_id, tipo, valor, taxa, liquido, resultado)
  values (
    trim(receber_evento_asaas.evento_externo),
    alvo_id,
    receber_evento_asaas.tipo,
    receber_evento_asaas.valor_recebido,
    receber_evento_asaas.taxa_recebida,
    receber_evento_asaas.liquido_recebido,
    'recebido'
  );
  return jsonb_build_object('ok', true, 'processar', true);
exception
  when unique_violation then
    return jsonb_build_object('ok', true, 'processar', true);
end;
$$;

create or replace function public.processar_evento_asaas(evento_externo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
declare
  evento public.eventos_pagamento;
  alvo public.cobrancas;
  centavos_esperados integer;
  centavos_recebidos integer;
  resultado text := 'ignorado';
  detalhe text := '';
  tipo text;
  valor_recebido numeric;
  taxa_recebida numeric;
  liquido_recebido numeric;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'Sem permissão.';
  end if;
  if evento_externo is null or length(trim(evento_externo)) < 4 then
    raise exception 'Evento incompleto.';
  end if;

  select * into evento
  from public.eventos_pagamento as registro
  where registro.evento_externo = trim(processar_evento_asaas.evento_externo)
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'repetir', true, 'mensagem', 'Evento ainda não registrado.');
  end if;
  if evento.resultado not in ('recebido', 'falhou') then
    return jsonb_build_object('ok', true, 'repetido', true, 'resultado', evento.resultado);
  end if;

  select * into alvo from public.cobrancas where id = evento.cobranca_id for update;
  if not found then
    update public.eventos_pagamento
    set resultado = 'falhou', detalhe = 'Cobrança sumiu antes do processamento.'
    where id = evento.id;
    return jsonb_build_object('ok', false, 'repetir', true);
  end if;

  tipo := evento.tipo;
  valor_recebido := evento.valor;
  taxa_recebida := evento.taxa;
  liquido_recebido := evento.liquido;
  centavos_esperados := round(alvo.valor_bruto * 100);
  centavos_recebidos := case when valor_recebido is null then null else round(valor_recebido * 100) end;

  if tipo = 'PAYMENT_RECEIVED' then
    if alvo.status in ('estornada', 'cancelada', 'analise') then
      update public.cobrancas set status = 'analise', atualizado_em = now() where id = alvo.id;
      resultado := 'analise';
      detalhe := 'Evento de pagamento depois de um estado final.';
    elsif alvo.status = 'pago' then
      resultado := 'repetido';
    elsif centavos_recebidos is null or centavos_recebidos <> centavos_esperados then
      update public.cobrancas set status = 'analise', atualizado_em = now() where id = alvo.id;
      resultado := 'analise';
      detalhe := 'O valor recebido não confere com o pedido.';
    else
      update public.cobrancas
      set
        status = 'pago',
        taxa = taxa_recebida,
        valor_liquido = liquido_recebido,
        atualizado_em = now()
      where id = alvo.id;
      update public.pedidos
      set status = 'pago', confirmacao = 'asaas'
      where usuario_id = alvo.usuario_id and txid = alvo.txid and status = 'aguardando';
      insert into public.direitos_acesso (usuario_id, atividade_id, txid, origem)
      select usuario_id, atividade_id, txid, 'compra'
      from public.pedidos
      where usuario_id = alvo.usuario_id and txid = alvo.txid and status = 'pago'
      on conflict (usuario_id, atividade_id) do update
      set txid = excluded.txid, origem = 'compra', revogado_em = null, concedido_em = now();
      resultado := 'pago';
    end if;
  elsif tipo = 'PAYMENT_CONFIRMED' then
    resultado := 'confirmado_sem_liberar';
    detalhe := 'PAYMENT_CONFIRMED não libera o PDF.';
  elsif tipo = 'PAYMENT_OVERDUE' and alvo.status in ('criada', 'pendente') then
    update public.cobrancas set status = 'expirada', atualizado_em = now() where id = alvo.id;
    resultado := 'expirada';
  elsif tipo = 'PAYMENT_DELETED' and alvo.status in ('criada', 'pendente', 'expirada') then
    update public.cobrancas set status = 'cancelada', atualizado_em = now() where id = alvo.id;
    update public.pedidos
    set status = 'cancelado'
    where usuario_id = alvo.usuario_id and txid = alvo.txid and status = 'aguardando';
    resultado := 'cancelada';
  elsif tipo = 'PAYMENT_PARTIALLY_REFUNDED' then
    update public.cobrancas set status = 'analise', atualizado_em = now() where id = alvo.id;
    resultado := 'analise';
    detalhe := 'Estorno parcial não libera nem revoga o material.';
  elsif tipo = 'PAYMENT_REFUNDED' and alvo.status in ('pago', 'analise') then
    update public.cobrancas
    set status = 'estornada', taxa = coalesce(taxa_recebida, taxa), valor_liquido = liquido_recebido, atualizado_em = now()
    where id = alvo.id;
    update public.pedidos
    set status = 'estornado'
    where usuario_id = alvo.usuario_id and txid = alvo.txid and status = 'pago';
    update public.direitos_acesso as direito
    set revogado_em = now()
    where direito.usuario_id = alvo.usuario_id
      and direito.txid = alvo.txid
      and direito.revogado_em is null
      and not exists (
        select 1 from public.pedidos as outro
        where outro.usuario_id = direito.usuario_id
          and outro.atividade_id = direito.atividade_id
          and outro.status = 'pago'
          and outro.txid is distinct from alvo.txid
      );
    resultado := 'estornada';
  elsif tipo = 'PAYMENT_REFUNDED' then
    update public.cobrancas set status = 'analise', atualizado_em = now() where id = alvo.id;
    resultado := 'analise';
    detalhe := 'Estorno chegou fora de ordem. O PDF não foi liberado.';
  elsif tipo in ('PAYMENT_CREATED', 'PAYMENT_UPDATED') and alvo.status = 'criada' then
    update public.cobrancas set status = 'pendente', atualizado_em = now() where id = alvo.id;
    resultado := 'pendente';
  end if;

  update public.eventos_pagamento
  set resultado = resultado, detalhe = detalhe
  where id = evento.id;
  return jsonb_build_object('ok', true, 'repetido', false, 'resultado', resultado);
end;
$$;

create or replace function public.confirmar_pix(pedido uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo public.pedidos;
begin
  if not public.sou_admin() then
    raise exception 'Sem permissão.';
  end if;
  select * into alvo from public.pedidos where id = pedido;
  if not found then
    raise exception 'Pedido não encontrado.';
  end if;
  update public.pedidos
  set status = 'pago', confirmacao = 'admin'
  where txid = alvo.txid
    and usuario_id = alvo.usuario_id
    and status = 'aguardando';
  insert into public.direitos_acesso (usuario_id, atividade_id, txid, origem)
  select distinct usuario_id, atividade_id, txid, 'compra'
  from public.pedidos
  where txid = alvo.txid
    and usuario_id = alvo.usuario_id
    and status = 'pago'
  on conflict (usuario_id, atividade_id) do update
  set txid = excluded.txid, origem = 'compra', revogado_em = null, concedido_em = now();
end;
$$;

revoke all on function public.pode_ver_financeiro() from public, anon;
grant execute on function public.pode_ver_financeiro() to authenticated;
revoke all on function public.pode_baixar(text) from public, anon;
grant execute on function public.pode_baixar(text) to authenticated;
revoke all on function public.preparar_cobranca(text[], text) from public, anon;
grant execute on function public.preparar_cobranca(text[], text) to authenticated;
revoke all on function public.desfazer_cobranca_sem_pix(uuid) from public, anon, authenticated;
grant execute on function public.desfazer_cobranca_sem_pix(uuid) to service_role;
revoke all on function public.gravar_pix_cobranca(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.gravar_pix_cobranca(uuid, text, text, timestamptz) to service_role;
revoke all on function public.receber_evento_asaas(text, text, text, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.receber_evento_asaas(text, text, text, numeric, numeric, numeric) to service_role;
revoke all on function public.processar_evento_asaas(text) from public, anon, authenticated;
grant execute on function public.processar_evento_asaas(text) to service_role;

create or replace function public.listar_conciliacao()
returns table (
  usuario_id uuid,
  email text,
  atividade_id text,
  titulo text,
  valor numeric,
  txid text,
  criado_em timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() is distinct from public.id_proprietaria() then
    raise exception 'Sem permissão.';
  end if;
  return query
  select pedido.usuario_id, perfil.email, pedido.atividade_id, pedido.titulo, pedido.valor, pedido.txid, pedido.criado_em
  from public.pedidos as pedido
  join public.perfis as perfil on perfil.id = pedido.usuario_id
  where pedido.status = 'pago'
    and pedido.confirmacao is null
    and pedido.legado
  order by pedido.criado_em;
end;
$$;

create or replace function public.conciliar_pedido(codigo text, confirmar boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  quantidade integer;
  autor uuid := auth.uid();
begin
  if autor is null or autor is distinct from public.id_proprietaria() then
    raise exception 'Sem permissão.';
  end if;
  if confirmar is distinct from true then
    return jsonb_build_object('ok', false, 'mensagem', 'Confirme explicitamente antes de liberar a compra antiga.');
  end if;
  if codigo is null or length(trim(codigo)) < 8 then
    raise exception 'Pedido inválido.';
  end if;
  update public.pedidos
  set confirmacao = 'legado_conferido'
  where txid = trim(codigo)
    and status = 'pago'
    and legado
    and confirmacao is null;
  get diagnostics quantidade = row_count;
  if quantidade = 0 then
    return jsonb_build_object('ok', false, 'mensagem', 'Não há compra antiga paga sem conferência com esse código.');
  end if;
  insert into public.direitos_acesso (usuario_id, atividade_id, txid, origem)
  select distinct usuario_id, atividade_id, txid, 'compra'
  from public.pedidos
  where txid = trim(codigo) and status = 'pago' and confirmacao = 'legado_conferido'
  on conflict (usuario_id, atividade_id) do update
  set txid = excluded.txid, origem = 'compra', revogado_em = null, concedido_em = now();
  insert into public.auditoria_conciliacao (conciliado_por, txid, quantidade)
  values (autor, trim(codigo), quantidade);
  return jsonb_build_object('ok', true, 'quantidade', quantidade);
end;
$$;

create or replace function public.encerrar_conciliacao()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pendentes integer;
  autor uuid := auth.uid();
begin
  if autor is null or autor is distinct from public.id_proprietaria() then
    raise exception 'Sem permissão.';
  end if;
  select count(*) into pendentes
  from public.pedidos
  where legado and status = 'pago' and confirmacao is null;
  if pendentes > 0 then
    return jsonb_build_object('ok', false, 'pendentes', pendentes, 'mensagem', 'Ainda há compra antiga sem conciliação. O acesso delas continua.');
  end if;
  update public.controle_conciliacao
  set aberta = false, encerrada_em = now(), encerrada_por = autor
  where id = 1;
  return jsonb_build_object('ok', true, 'mensagem', 'A exceção das compras antigas foi encerrada.');
end;
$$;

revoke all on function public.listar_conciliacao() from public, anon;
grant execute on function public.listar_conciliacao() to authenticated;
revoke all on function public.conciliar_pedido(text, boolean) from public, anon;
grant execute on function public.conciliar_pedido(text, boolean) to authenticated;
revoke all on function public.encerrar_conciliacao() from public, anon;
grant execute on function public.encerrar_conciliacao() to authenticated;

create or replace function public.resumo_conciliacao()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  legados integer;
  conciliados integer;
  pendentes integer;
  direitos integer;
  sem_vinculo integer;
  aberta boolean;
begin
  if auth.uid() is null or auth.uid() is distinct from public.id_proprietaria() then
    raise exception 'Sem permissão.';
  end if;
  select count(*) into legados from public.pedidos where legado;
  select count(*) into conciliados from public.pedidos where legado and confirmacao = 'legado_conferido';
  select count(*) into pendentes from public.pedidos where legado and status = 'pago' and confirmacao is null;
  select count(*) into direitos from public.direitos_acesso where revogado_em is null;
  select count(*) into sem_vinculo
  from public.pedidos as pedido
  where pedido.legado
    and pedido.confirmacao = 'legado_conferido'
    and not exists (
      select 1 from public.direitos_acesso as direito
      where direito.usuario_id = pedido.usuario_id
        and direito.atividade_id = pedido.atividade_id
        and direito.revogado_em is null
    );
  select controle.aberta into aberta from public.controle_conciliacao as controle where controle.id = 1;
  return jsonb_build_object(
    'legados', legados,
    'conciliados', conciliados,
    'pendentes', pendentes,
    'direitos_ativos', direitos,
    'conciliados_sem_direito', sem_vinculo,
    'excecao_aberta', coalesce(aberta, false)
  );
end;
$$;

revoke all on function public.resumo_conciliacao() from public, anon;
grant execute on function public.resumo_conciliacao() to authenticated;

drop policy if exists "cliente le a propria cobranca" on public.cobrancas;
create policy "cliente le a propria cobranca"
on public.cobrancas for select
to authenticated
using (usuario_id = auth.uid());

drop policy if exists "financeiro le cobrancas" on public.cobrancas;
create policy "financeiro le cobrancas"
on public.cobrancas for select
to authenticated
using (public.pode_ver_financeiro());

drop policy if exists "quem pagou baixa" on storage.objects;
drop policy if exists "admin le atividade" on storage.objects;
create policy "quem pagou baixa"
on storage.objects for select
to authenticated
using (
  bucket_id = 'atividades'
  and public.pode_baixar(split_part(name, '/', 1))
);

update public.pedidos
set legado = true
where status = 'pago' and confirmacao is null and legado = false;

commit;
