-- NÃO rode este arquivo sem autorização.
-- Remove a função e a coluna do PDF anterior.
-- Não altera o nome vigente, não apaga arquivos do espaço privado
-- e não mexe em pedido, direito, capa nem permissão.
-- Se uma troca já tiver sido confirmada, o ponteiro continua na versão nova.
-- O arquivo anterior permanece no bucket, mas o botão de restaurar sai do painel.

begin;

drop function if exists public.definir_arquivo(text, text);

alter table public.atividades drop column if exists arquivo_anterior;

notify pgrst, 'reload schema';

commit;
