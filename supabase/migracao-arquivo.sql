-- NÃO rode este arquivo agora.
-- Ele só cria a função que aponta a atividade para um PDF já enviado.
-- Não apaga arquivo, não mexe em pedido, direito, capa nem permissão.
-- O painel publicado não chama esta função. Substituir e restaurar ficam
-- indisponíveis até uma autorização posterior.
-- Três correções já estão preparadas aqui e no painel:
-- 1. o catálogo do PostgREST é recarregado no fim;
-- 2. a referência só muda se o PDF novo já estiver no espaço privado;
-- 3. o painel reconhece o arquivo anterior mesmo depois de recarregar a página.

begin;

create or replace function public.definir_arquivo(atividade text, nome text)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
  if not exists (select 1 from public.atividades where id = atividade) then
    raise exception 'Atividade não encontrada.';
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
  set arquivo = nome
  where id = atividade;
end;
$$;

revoke all on function public.definir_arquivo(text, text) from public, anon;
grant execute on function public.definir_arquivo(text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
