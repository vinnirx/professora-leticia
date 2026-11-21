-- Desfaz somente a proposta de confirmação financeira, se ela tiver sido aplicada.
-- Restaura a confirmação manual atual. Não mexe em pedido, preço, PDF nem pagamento gravado.

begin;

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

notify pgrst, 'reload schema';

commit;
