-- Devolve as atividades arquivadas para a vitrine.
-- Não apaga pedido, PDF, direito de download nem a auditoria.
-- Não restaura uma atividade cujo cadastro já tenha sido apagado.

update public.atividades
set arquivada_em = null, arquivada_por = null
where arquivada_em is not null;

drop trigger if exists impedir_compra_arquivada on public.pedidos;
drop function if exists public.impedir_compra_arquivada();
drop function if exists public.apagar_atividade_sem_venda(text);
drop function if exists public.restaurar_atividade(text);
drop function if exists public.arquivar_atividade(text);
drop function if exists public.motivo_dona_atividade();

drop policy if exists "atividades a vista" on public.atividades;
create policy "atividades a vista"
on public.atividades for select
to anon, authenticated
using (true);
