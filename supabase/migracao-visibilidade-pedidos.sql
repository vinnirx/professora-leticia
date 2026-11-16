-- Organiza a visualização de Minha Conta. Não cancela pedidos já existentes.
-- Acrescenta só a visibilidade do cliente. Não apaga pedido, cobrança, evento, PDF nem direito.
-- Reversão: supabase/reverter-visibilidade-pedidos.sql

alter table public.pedidos add column if not exists oculto_em timestamptz;

create or replace function public.cancelar_tentativa_sem_cobranca(codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  autor uuid := auth.uid();
begin
  if autor is null then
    return jsonb_build_object('ok', false, 'mensagem', 'Entre na conta para continuar.');
  end if;
  if codigo is null or codigo !~ '^[A-Za-z0-9]{8,40}$' then
    return jsonb_build_object('ok', false, 'mensagem', 'Não encontrei este pedido na sua conta.');
  end if;

  perform pg_advisory_xact_lock(hashtext(autor::text || ':cancelar:' || codigo));

  if not exists (select 1 from public.pedidos where usuario_id = autor and txid = codigo) then
    return jsonb_build_object('ok', false, 'mensagem', 'Não encontrei este pedido na sua conta.');
  end if;
  if exists (
    select 1 from public.pedidos
    where usuario_id = autor and txid = codigo
      and (status in ('pago', 'estornado') or confirmacao is not null)
  ) then
    return jsonb_build_object('ok', false, 'mensagem', 'Este pedido já tem pagamento confirmado e não pode ser cancelado.');
  end if;
  if exists (
    select 1 from public.direitos_acesso
    where usuario_id = autor and txid = codigo and revogado_em is null
  ) then
    return jsonb_build_object('ok', false, 'mensagem', 'Este pedido tem download liberado e não pode ser cancelado.');
  end if;
  if exists (
    select 1 from public.cobrancas
    where usuario_id = autor and txid = codigo
      and (
        cobranca_externa is not null
        or copia_cola is not null
        or status in ('pago', 'estornada', 'analise')
      )
  ) then
    return jsonb_build_object('ok', false, 'mensagem', 'Existe cobrança no Asaas. O cancelamento dessa cobrança não foi feito.');
  end if;
  if exists (
    select 1 from public.eventos_pagamento as evento
    join public.cobrancas as cobranca on cobranca.id = evento.cobranca_id
    where cobranca.usuario_id = autor and cobranca.txid = codigo
  ) then
    return jsonb_build_object('ok', false, 'mensagem', 'Este pedido já tem evento financeiro e não foi cancelado.');
  end if;
  if not exists (
    select 1 from public.pedidos
    where usuario_id = autor and txid = codigo and status = 'aguardando'
  ) then
    return jsonb_build_object('ok', true, 'repetido', true, 'acao', 'cancelado', 'mensagem', 'Esta tentativa já está cancelada.');
  end if;

  update public.pedidos
  set status = 'cancelado'
  where usuario_id = autor and txid = codigo and status = 'aguardando';
  update public.cobrancas
  set status = 'cancelada', atualizado_em = now()
  where usuario_id = autor
    and txid = codigo
    and cobranca_externa is null
    and copia_cola is null
    and status in ('criada', 'pendente');
  return jsonb_build_object('ok', true, 'repetido', false, 'acao', 'cancelado', 'mensagem', 'A tentativa foi cancelada. Os registros continuam guardados.');
end;
$$;

create or replace function public.definir_visibilidade_pedido(codigo text, ocultar boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  autor uuid := auth.uid();
begin
  if autor is null then
    return jsonb_build_object('ok', false, 'mensagem', 'Entre na conta para continuar.');
  end if;
  if codigo is null or codigo !~ '^[A-Za-z0-9]{8,40}$' then
    return jsonb_build_object('ok', false, 'mensagem', 'Não encontrei este pedido na sua conta.');
  end if;
  if not exists (select 1 from public.pedidos where usuario_id = autor and txid = codigo) then
    return jsonb_build_object('ok', false, 'mensagem', 'Não encontrei este pedido na sua conta.');
  end if;
  if ocultar and exists (
    select 1 from public.pedidos
    where usuario_id = autor and txid = codigo and status = 'pago'
  ) then
    return jsonb_build_object('ok', false, 'mensagem', 'Compras pagas permanecem no histórico.');
  end if;
  if ocultar and exists (
    select 1 from public.cobrancas
    where usuario_id = autor and txid = codigo
      and copia_cola is not null
      and status in ('criada', 'pendente')
  ) then
    return jsonb_build_object('ok', false, 'mensagem', 'Um Pix em aberto permanece visível até o pagamento ou o cancelamento.');
  end if;

  update public.pedidos
  set oculto_em = case when ocultar then coalesce(oculto_em, now()) else null end
  where usuario_id = autor and txid = codigo;
  return jsonb_build_object(
    'ok', true,
    'oculto', ocultar,
    'mensagem', case when ocultar then 'A tentativa saiu da lista principal.' else 'A tentativa voltou para a lista.' end
  );
end;
$$;

revoke all on function public.cancelar_tentativa_sem_cobranca(text) from public, anon, service_role;
revoke all on function public.definir_visibilidade_pedido(text, boolean) from public, anon, service_role;
grant execute on function public.cancelar_tentativa_sem_cobranca(text) to authenticated;
grant execute on function public.definir_visibilidade_pedido(text, boolean) to authenticated;
