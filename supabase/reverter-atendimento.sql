-- Remove o acesso novo da central de ajuda, se a migração tiver sido aplicada.
-- NÃO execute este arquivo sem autorização.
-- Esta reversão conserva os chamados e as mensagens já gravados.

begin;

drop trigger if exists proteger_solicitacao on public.solicitacoes;
drop function if exists public.proteger_solicitacao();
drop function if exists public.listar_contas(text, integer, integer);
revoke all on public.solicitacoes from anon, authenticated;
revoke all on public.solicitacao_mensagens from anon, authenticated;

notify pgrst, 'reload schema';

commit;
