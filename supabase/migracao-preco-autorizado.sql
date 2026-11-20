-- Grava os dois preços já autorizados que ficaram só no arquivo local.
-- Altera somente atividades.preco de resolver-problemas e silabas, de 4.90 para 5.00.
-- Não mexe em pedido, cobrança, direito, Tabuada, Células nem nas outras atividades.
-- A Tabuada permanece em 4.90 até autorização da proprietária.
-- Células não é restaurada.

begin;

do $$
declare
  antes jsonb;
  depois jsonb;
  alteradas int;
  pedidos_antes jsonb;
  pedidos_depois jsonb;
  direitos_antes int;
  direitos_depois int;
  pedido_antes jsonb;
  pedido_depois jsonb;
begin
  if (select count(*) from public.atividades where id = 'resolver-problemas' and preco = 4.90) <> 1 then
    raise exception 'resolver-problemas não está em 4.90';
  end if;
  if (select count(*) from public.atividades where id = 'silabas' and preco = 4.90) <> 1 then
    raise exception 'silabas não está em 4.90';
  end if;

  select jsonb_agg((to_jsonb(a) - 'preco') order by a.id)
  into antes
  from public.atividades a
  where a.id in ('resolver-problemas', 'silabas');

  select jsonb_agg(jsonb_build_object(
    'atividade_id', atividade_id,
    'status', status,
    'valor', valor,
    'linhas', linhas
  ) order by atividade_id, status, valor)
  into pedidos_antes
  from (
    select atividade_id, status, valor, count(*) as linhas
    from public.pedidos
    group by atividade_id, status, valor
  ) s;

  select count(*) into direitos_antes from public.direitos_acesso;

  select jsonb_build_object(
    'linhas', count(*),
    'soma', sum(valor),
    'pagos', count(*) filter (where status = 'pago'),
    'direitos', (
      select count(*)
      from public.direitos_acesso d
      join public.pedidos p on p.usuario_id = d.usuario_id and p.atividade_id = d.atividade_id
      where p.txid = '9d2daf094d' and d.revogado_em is null
    )
  )
  into pedido_antes
  from public.pedidos
  where txid = '9d2daf094d';

  update public.atividades
  set preco = 5.00
  where id in ('resolver-problemas', 'silabas')
    and preco = 4.90;

  get diagnostics alteradas = row_count;
  if alteradas <> 2 then
    raise exception 'quantidade inesperada: %', alteradas;
  end if;

  select jsonb_agg((to_jsonb(a) - 'preco') order by a.id)
  into depois
  from public.atividades a
  where a.id in ('resolver-problemas', 'silabas');

  if antes is distinct from depois then
    raise exception 'outro campo da atividade mudou';
  end if;

  select jsonb_agg(jsonb_build_object(
    'atividade_id', atividade_id,
    'status', status,
    'valor', valor,
    'linhas', linhas
  ) order by atividade_id, status, valor)
  into pedidos_depois
  from (
    select atividade_id, status, valor, count(*) as linhas
    from public.pedidos
    group by atividade_id, status, valor
  ) s;

  if pedidos_antes is distinct from pedidos_depois then
    raise exception 'pedido histórico mudou';
  end if;

  select count(*) into direitos_depois from public.direitos_acesso;
  if direitos_antes is distinct from direitos_depois then
    raise exception 'direito de download mudou';
  end if;

  select jsonb_build_object(
    'linhas', count(*),
    'soma', sum(valor),
    'pagos', count(*) filter (where status = 'pago'),
    'direitos', (
      select count(*)
      from public.direitos_acesso d
      join public.pedidos p on p.usuario_id = d.usuario_id and p.atividade_id = d.atividade_id
      where p.txid = '9d2daf094d' and d.revogado_em is null
    )
  )
  into pedido_depois
  from public.pedidos
  where txid = '9d2daf094d';

  if pedido_antes is distinct from pedido_depois then
    raise exception 'pedido 9d2daf094d mudou';
  end if;

  if (select preco from public.atividades where id = 'resolver-problemas') <> 5.00
     or (select preco from public.atividades where id = 'silabas') <> 5.00
     or (select preco from public.atividades where id = 'atividade-tabuada-de-pitagoras-com-apoio') <> 4.90
     or (select preco from public.atividades where id = 'celulas') <> 5.00
     or (select arquivada_em is not null from public.atividades where id = 'celulas') is not true
     or (select preco from public.atividades where id = 'adicao') <> 9.90
     or (select preco from public.atividades where id = 'adicao-50') <> 9.90
  then
    raise exception 'catálogo final divergente';
  end if;
end $$;

commit;
