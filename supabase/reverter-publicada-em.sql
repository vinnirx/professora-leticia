-- Remove só a data da primeira publicação.
-- Não apaga atividade, pedido, direito, preço nem arquivo.
-- As quatro novidades voltam a depender do código anterior depois que a coluna deixa de existir.

begin;

drop trigger if exists registrar_primeira_publicacao on public.atividades;
drop function if exists public.registrar_primeira_publicacao();
alter table public.atividades drop column if exists publicada_em;

notify pgrst, 'reload schema';

commit;
