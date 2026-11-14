-- NÃO rode este arquivo agora.
-- Pronto para autorização. Ele só cria public.editar_campos.
-- Não cria, não substitui e não remove editar_atividade.
-- Não altera atividade, PDF, capa, pedido, direito nem permissão.
-- Uma chave ausente conserva o valor atual, inclusive nulo.
-- Uma chave desconhecida, como arquivo ou capa, é ignorada.

begin;

create or replace function public.editar_campos(atividade_id text, campos jsonb)
returns public.atividades
language plpgsql
security definer
set search_path = public
as $$
declare
  atual public.atividades;
  novo public.atividades;
  permitidos text[] := array[
    'titulo', 'resumo', 'explicacao', 'preco', 'uso', 'inclui',
    'habilidades', 'destaque', 'area', 'tema', 'informacoes'
  ];
begin
  if not public.sou_admin() then
    raise exception 'Sem permissão.';
  end if;
  if atividade_id is null or atividade_id !~ '^[a-z0-9-]{1,48}$' then
    raise exception 'Diga qual é a atividade.';
  end if;
  if campos is null or jsonb_typeof(campos) <> 'object' then
    raise exception 'Não há campo permitido para salvar.';
  end if;
  if not exists (
    select 1
    from jsonb_object_keys(campos) as chave
    where chave = any (permitidos)
  ) then
    raise exception 'Não há campo permitido para salvar.';
  end if;

  select * into atual
  from public.atividades
  where id = atividade_id
  for update;
  if not found then
    raise exception 'Atividade não encontrada.';
  end if;

  if campos ? 'titulo'
     and (jsonb_typeof(campos->'titulo') <> 'string' or length(trim(campos->>'titulo')) < 3) then
    raise exception 'Diga qual é a atividade.';
  end if;
  if campos ? 'resumo'
     and (jsonb_typeof(campos->'resumo') <> 'string' or length(trim(campos->>'resumo')) < 10) then
    raise exception 'Escreva uma descrição breve.';
  end if;
  if campos ? 'explicacao'
     and (jsonb_typeof(campos->'explicacao') <> 'string' or length(trim(campos->>'explicacao')) < 20) then
    raise exception 'Explique o que a pessoa pode esperar.';
  end if;
  if campos ? 'preco' and (
    jsonb_typeof(campos->'preco') not in ('number', 'string')
    or campos->>'preco' !~ '^[0-9]+(\.[0-9]{1,2})?$'
  ) then
    raise exception 'O preço precisa ser maior que zero.';
  end if;
  if campos ? 'preco' and (
    (campos->>'preco')::numeric <= 0
    or (campos->>'preco')::numeric > 99999999.99
  ) then
    raise exception 'O preço precisa ser maior que zero.';
  end if;
  if campos ? 'uso' and jsonb_typeof(campos->'uso') <> 'string' then
    raise exception 'O uso informado não pode ser salvo.';
  end if;
  if campos ? 'inclui' and jsonb_typeof(campos->'inclui') <> 'string' then
    raise exception 'O conteúdo informado não pode ser salvo.';
  end if;
  if campos ? 'habilidades' and jsonb_typeof(campos->'habilidades') <> 'string' then
    raise exception 'As habilidades informadas não podem ser salvas.';
  end if;
  if campos ? 'area' and jsonb_typeof(campos->'area') <> 'string' then
    raise exception 'A área informada não pode ser salva.';
  end if;
  if campos ? 'tema' and jsonb_typeof(campos->'tema') <> 'string' then
    raise exception 'O tema informado não pode ser salvo.';
  end if;
  if campos ? 'destaque' and jsonb_typeof(campos->'destaque') <> 'boolean' then
    raise exception 'O destaque precisa ser sim ou não.';
  end if;
  if campos ? 'informacoes' and jsonb_typeof(campos->'informacoes') <> 'array' then
    raise exception 'As informações complementares precisam ser uma lista.';
  end if;
  if campos ? 'informacoes' and exists (
    select 1
    from jsonb_array_elements(campos->'informacoes') as item
    where jsonb_typeof(item) <> 'array'
      or jsonb_array_length(item) <> 2
      or jsonb_typeof(item->0) <> 'string'
      or jsonb_typeof(item->1) <> 'string'
  ) then
    raise exception 'As informações complementares precisam ser uma lista.';
  end if;
  if campos ? 'destaque'
     and (campos->>'destaque')::boolean
     and not coalesce(atual.destaque, false) then
    perform 1
    from public.atividades
    where destaque
    order by id
    for update;
    if (select count(*) from public.atividades where destaque and id <> atividade_id) >= 4 then
      raise exception 'A vitrine mostra no máximo 4. Tire uma do destaque antes.';
    end if;
  end if;

  update public.atividades
  set
    titulo = case when campos ? 'titulo' then trim(campos->>'titulo') else titulo end,
    resumo = case when campos ? 'resumo' then trim(campos->>'resumo') else resumo end,
    explicacao = case when campos ? 'explicacao' then trim(campos->>'explicacao') else explicacao end,
    preco = case when campos ? 'preco' then (campos->>'preco')::numeric else preco end,
    uso = case when campos ? 'uso' then trim(campos->>'uso') else uso end,
    inclui = case when campos ? 'inclui' then campos->>'inclui' else inclui end,
    habilidades = case when campos ? 'habilidades' then campos->>'habilidades' else habilidades end,
    destaque = case when campos ? 'destaque' then (campos->>'destaque')::boolean else destaque end,
    area = case when campos ? 'area' then trim(campos->>'area') else area end,
    tema = case when campos ? 'tema' then trim(campos->>'tema') else tema end,
    informacoes = case when campos ? 'informacoes' then campos->'informacoes' else informacoes end
  where id = atividade_id
  returning * into novo;
  return novo;
end;
$$;

revoke all on function public.editar_campos(text, jsonb) from public, anon;
grant execute on function public.editar_campos(text, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
