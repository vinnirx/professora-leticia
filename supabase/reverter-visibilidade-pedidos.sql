-- Remove a visibilidade do cliente. Os pedidos, cobranças, eventos e direitos permanecem.
-- A data em que o cliente ocultou a tentativa se perde com a coluna.

drop function if exists public.cancelar_tentativa_sem_cobranca(text);
drop function if exists public.definir_visibilidade_pedido(text, boolean);
alter table public.pedidos drop column if exists oculto_em;
