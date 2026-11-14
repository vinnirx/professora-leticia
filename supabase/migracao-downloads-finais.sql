-- NÃO rode este arquivo agora.
-- Rode só depois de três condições, nesta ordem:
-- 1. A proprietária encerrou a conciliação no painel e não restou compra antiga.
-- 2. A função link-download já está publicada e o cliente recebe o link por ela.
-- 3. A versão do site que chama link-download já está no ar.
-- Sem esses três passos, quem pagou fica sem PDF.
-- Este arquivo não apaga pedido, direito nem arquivo.

do $$
begin
  if to_regclass('public.controle_conciliacao') is null then
    raise exception 'A migração de pagamentos ainda não foi aplicada.';
  end if;
  if exists (select 1 from public.controle_conciliacao where id = 1 and aberta) then
    raise exception 'A conciliação ainda está aberta. Não restrinja o Storage.';
  end if;
  if exists (
    select 1 from public.pedidos
    where legado and status = 'pago' and confirmacao is null
  ) then
    raise exception 'Ainda há compra antiga sem conciliação.';
  end if;
end;
$$;

drop policy if exists "quem pagou baixa" on storage.objects;
drop policy if exists "admin le atividade" on storage.objects;
create policy "admin le atividade"
on storage.objects for select
to authenticated
using (
  bucket_id = 'atividades'
  and public.sou_admin()
);
