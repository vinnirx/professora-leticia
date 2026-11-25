-- Restaura as funções de pedido que estavam em produção antes do bloqueio.
-- NÃO execute sem autorização.
-- Não altera pedidos, cobranças, preços, PDFs nem direitos.
-- Os gatilhos de e-mail confirmado e de atividade arquivada permanecem.

begin;

create or replace function public.criar_pedido(atividade text, txid text)
returns public.pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.atividades;
  novo public.pedidos;
begin
  if auth.uid() is null then
    raise exception 'Entre na conta para comprar.';
  end if;
  if txid is null or length(trim(txid)) < 8 then
    raise exception 'Código do pedido inválido.';
  end if;
  select * into item from public.atividades where id = atividade;
  if not found then
    raise exception 'Atividade indisponível.';
  end if;
  insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid)
  values (auth.uid(), item.id, item.titulo, item.preco, trim(txid))
  returning * into novo;
  return novo;
end;
$$;

create or replace function public.criar_pedidos(atividades text[], codigo text)
returns setof public.pedidos
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
declare
  item public.atividades;
  pedido_codigo text := trim(codigo);
begin
  if auth.uid() is null then
    raise exception 'Entre na conta para comprar.';
  end if;
  if pedido_codigo is null or length(pedido_codigo) < 8 then
    raise exception 'Código do pedido inválido.';
  end if;
  if atividades is null or cardinality(atividades) < 1 then
    raise exception 'O carrinho está vazio.';
  end if;
  if (select count(distinct id) from public.atividades where id = any(atividades))
     <> (select count(distinct id) from unnest(atividades) as pedido(id)) then
    raise exception 'Atividade indisponível.';
  end if;
  if exists (
    select 1 from public.atividades
    where id = any(atividades)
      and arquivada_em is not null
  ) then
    raise exception 'Esta atividade não está mais à venda.';
  end if;
  for item in
    select * from public.atividades where id = any(atividades)
  loop
    if item.preco is null or item.preco <= 0 then
      raise exception 'Atividade indisponível.';
    end if;
    insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid)
    values (auth.uid(), item.id, item.titulo, item.preco, pedido_codigo);
  end loop;
  return query
    select * from public.pedidos
    where usuario_id = auth.uid() and txid = pedido_codigo;
end;
$$;

revoke all on function public.criar_pedido(text, text) from public, anon;
revoke all on function public.criar_pedidos(text[], text) from public, anon;
grant execute on function public.criar_pedido(text, text) to authenticated;
grant execute on function public.criar_pedidos(text[], text) to authenticated;

notify pgrst, 'reload schema';

commit;
