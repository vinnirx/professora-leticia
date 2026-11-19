-- NÃO APLICAR em produção sem autorização expressa.
-- A versão 1.0 deixa o catálogo, o suporte e a leitura administrativa
-- funcionarem com sessão válida e papel conferido, sem segundo fator.
-- Não altera pedido, preço, cobrança, PDF, direito de download nem conta.
-- Não mexe em pode_ver_financeiro, definir_papel, definir_financeiro,
-- motivo_proprietaria, estorno ou webhook.
-- Reversão: aplicar de novo supabase/migracao-aal2-admin.sql.
-- Essa reversão devolve o segundo fator a sou_admin() e a motivo_dona_atividade()
-- sem apagar atividade, pedido ou auditoria.

create or replace function public.sou_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfis
    where id = auth.uid()
      and papel in ('admin', 'super_admin', 'owner')
  )
  and public.sessao_ainda_valida();
$$;

revoke all on function public.sou_admin() from public, anon;
grant execute on function public.sou_admin() to authenticated;

create or replace function public.motivo_dona_atividade()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or auth.uid() is distinct from public.id_proprietaria() then
    return 'Só a proprietária pode retirar ou repor uma atividade.';
  end if;
  if not public.sessao_ainda_valida() then
    return 'Esta sessão não está mais ativa.';
  end if;
  return '';
end;
$$;

revoke all on function public.motivo_dona_atividade() from public, anon, authenticated;
