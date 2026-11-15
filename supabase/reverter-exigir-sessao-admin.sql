-- Remove a exigência de sessão ativa das funções administrativas.
-- Não apaga sessão, pedido, PDF nem conta.
-- Rode somente para desfazer migracao-exigir-sessao-admin.sql.
-- Se migracao-aal2-admin.sql estiver aplicada, desfaça essa antes.

create or replace function public.sou_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid()
      and papel in ('admin', 'super_admin', 'owner')
  );
$$;

create or replace function public.pode_ver_financeiro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid()
      and (
        papel in ('owner', 'super_admin')
        or (papel = 'admin' and acesso_financeiro)
      )
  );
$$;

create or replace function public.historico_permissoes()
returns table (
  id uuid,
  executado_por uuid,
  afetado uuid,
  papel_anterior text,
  papel_novo text,
  operacao text,
  resultado text,
  detalhe text,
  criado_em timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from public.id_proprietaria() then
    raise exception 'Sem permissão.';
  end if;
  return query
  select
    registro.id,
    registro.executado_por,
    registro.afetado,
    registro.papel_anterior,
    registro.papel_novo,
    registro.operacao,
    registro.resultado,
    registro.detalhe,
    registro.criado_em
  from public.auditoria_permissoes as registro
  order by registro.criado_em desc
  limit 100;
end;
$$;

create or replace function public.motivo_proprietaria()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or auth.uid() is distinct from public.id_proprietaria() then
    return 'Sem permissão.';
  end if;
  return '';
end;
$$;

revoke all on function public.motivo_proprietaria() from public, anon, authenticated;
