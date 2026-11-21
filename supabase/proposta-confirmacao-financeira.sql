-- Bloqueio autorizado da confirmação manual de Pix na versão 1.0.
-- A função permanece para compatibilidade e recusa qualquer perfil.
-- Não grava pedido, direito, cobrança nem preço.
-- Não altera webhook, conciliação nem pedidos existentes.
-- Reversão somente após diagnóstico: supabase/reverter-confirmacao-financeira.sql

begin;

create or replace function public.confirmar_pix(pedido uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sou_admin() then
    raise exception 'Sem permissão.';
  end if;
  if pedido is null then
    raise exception 'Pedido não encontrado.';
  end if;
  raise exception 'A confirmação manual não está disponível. O pagamento é confirmado pelo Asaas.';
end;
$$;

notify pgrst, 'reload schema';

commit;
