-- NÃO rode este arquivo agora.
-- Reversão da edição parcial. Remove somente public.editar_campos.
-- Não mexe em editar_atividade, atividades, PDF, capa, pedido, direito nem permissão.

begin;

drop function if exists public.editar_campos(text, jsonb);

notify pgrst, 'reload schema';

commit;
