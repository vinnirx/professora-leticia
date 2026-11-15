-- NÃO APLICAR sem autorização.
-- Confere se o session_id do JWT ainda existe em auth.sessions.
-- Um JWT sem esse campo passa a ser recusado quando a função for ligada às operações.
-- Esta migração só cria a função. Ela ainda não é chamada por cargo, Pix, PDF ou financeiro.

create or replace function public.sessao_ainda_valida()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  usuario uuid;
  sessao uuid;
begin
  usuario := auth.uid();
  if usuario is null or auth.jwt() is null then
    return false;
  end if;
  begin
    sessao := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;
  if sessao is null then
    return false;
  end if;
  return exists (
    select 1
    from auth.sessions
    where id = sessao
      and user_id = usuario
  );
end;
$$;

revoke all on function public.sessao_ainda_valida() from public, anon;
grant execute on function public.sessao_ainda_valida() to authenticated;
