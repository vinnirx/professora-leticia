-- Remove a trava de e-mail confirmado na compra, se ela tiver sido aplicada.
-- NÃO execute este arquivo sem autorização.
-- Não altera pedidos nem contas.

begin;

drop trigger if exists exigir_email_confirmado on public.pedidos;
drop function if exists public.exigir_email_confirmado();

notify pgrst, 'reload schema';

commit;
