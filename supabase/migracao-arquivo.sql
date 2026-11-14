-- NÃO rode este arquivo agora. Pronto para autorização.
-- Cria a função que aponta a atividade para um PDF já enviado no espaço privado.
-- Guarda o nome anterior na própria atividade, para a restauração sobreviver
-- a uma saída do painel. Não apaga arquivo e não mexe em pedido, direito,
-- capa nem permissão. O download continua lendo o nome vigente.

begin;

alter table public.atividades
  add column if not exists arquivo_anterior text not null default '';

create or replace function public.definir_arquivo(atividade text, nome text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  vigente text;
begin
  if not public.sou_admin() then
    raise exception 'Sem permissão.';
  end if;
  if atividade is null or atividade !~ '^[a-z0-9-]{1,48}$' then
    raise exception 'Diga qual é a atividade.';
  end if;
  if nome is null or nome !~ '^[A-Za-z0-9._-]{1,180}$' or right(nome, 4) <> '.pdf' then
    raise exception 'O PDF precisa de um nome seguro.';
  end if;
  select arquivo into vigente
  from public.atividades
  where id = atividade
  for update;
  if not found then
    raise exception 'Atividade não encontrada.';
  end if;
  if vigente = nome then
    return;
  end if;
  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'atividades'
      and name = atividade || '/' || nome
  ) then
    raise exception 'O PDF novo ainda não está guardado.';
  end if;
  update public.atividades
  set
    arquivo_anterior = case when vigente <> '' then vigente else arquivo_anterior end,
    arquivo = nome
  where id = atividade;
end;
$$;

revoke all on function public.definir_arquivo(text, text) from public, anon;
grant execute on function public.definir_arquivo(text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
