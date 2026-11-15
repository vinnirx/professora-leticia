-- Remove a central de ajuda se a migração tiver sido aplicada.
-- NÃO execute este arquivo sem autorização.
-- Não altera atividades, pedidos, PDFs, cargos nem contas.

begin;

drop trigger if exists proteger_solicitacao on public.solicitacoes;
drop function if exists public.proteger_solicitacao();
drop function if exists public.listar_contas(text, integer, integer);
drop table if exists public.solicitacao_mensagens;
drop table if exists public.solicitacoes;

notify pgrst, 'reload schema';

commit;
