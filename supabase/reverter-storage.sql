-- Use só se a migração final do Storage tiver sido aplicada e o cliente ficar sem PDF.
-- Não apaga pedido, cobrança, evento nem direito.
-- Não volta a autorizar download só porque o pedido está pago.
-- O acesso volta a seguir pode_baixar: direito ativo, administrador, ou compra antiga enquanto a exceção estiver aberta.

drop policy if exists "admin le atividade" on storage.objects;
drop policy if exists "quem pagou baixa" on storage.objects;
create policy "quem pagou baixa"
on storage.objects for select
to authenticated
using (
  bucket_id = 'atividades'
  and public.pode_baixar(split_part(name, '/', 1))
);
