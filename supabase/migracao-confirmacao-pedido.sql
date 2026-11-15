-- Impede compra nova de conta sem e-mail confirmado.
-- NÃO execute este arquivo sem autorização.
-- Não altera pedidos, contas, PDFs nem cargos existentes.
-- Antes de aplicar, conte em modo somente leitura as contas com email_confirmed_at nulo.
-- A proprietária e os administradores precisam continuar confirmados.

begin;

create or replace function public.exigir_email_confirmado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.usuario_id is null
     or (select usuario.email_confirmed_at from auth.users as usuario where usuario.id = new.usuario_id) is null then
    raise exception 'Confirme o e-mail antes de comprar.';
  end if;
  return new;
end;
$$;

drop trigger if exists exigir_email_confirmado on public.pedidos;
create trigger exigir_email_confirmado
before insert on public.pedidos
for each row execute function public.exigir_email_confirmado();

revoke all on function public.exigir_email_confirmado() from public, anon, authenticated;
grant execute on function public.exigir_email_confirmado() to authenticated;

notify pgrst, 'reload schema';

commit;
