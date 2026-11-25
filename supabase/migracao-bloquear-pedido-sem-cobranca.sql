-- Não aplicar em produção sem autorização.
-- Recusa pedido avulso, sem cobrança. Não altera pedidos, cobranças nem direitos existentes.
-- A conta autorizada continua pelo caminho da cobrança automática já publicado.

create or replace function public.criar_pedido(atividade text, txid text)
returns public.pedidos
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'As compras ainda não estão abertas.';
end;
$$;

create or replace function public.criar_pedidos(atividades text[], codigo text)
returns setof public.pedidos
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'As compras ainda não estão abertas.';
end;
$$;

revoke all on function public.criar_pedido(text, text) from public, anon;
revoke all on function public.criar_pedidos(text[], text) from public, anon;
grant execute on function public.criar_pedido(text, text) to authenticated;
grant execute on function public.criar_pedidos(text[], text) to authenticated;
