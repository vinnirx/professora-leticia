-- NÃO rode este arquivo agora.
-- Ele só cria a função que aponta a atividade para um PDF já enviado.
-- Não apaga arquivo, não mexe em pedido, direito, capa nem permissão.
-- A loja já consegue guardar uma cópia e substituir sem esta função.
-- Quando esta função existir, a troca passa a gravar o PDF novo em outro
-- objeto e só então muda a referência. O objeto anterior permanece.

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
  update public.atividades
  set arquivo = nome
  where id = atividade;
end;
$$;

revoke all on function public.definir_arquivo(text, text) from public, anon;
grant execute on function public.definir_arquivo(text, text) to authenticated;

commit;
