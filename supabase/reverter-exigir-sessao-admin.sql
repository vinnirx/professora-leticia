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
