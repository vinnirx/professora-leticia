-- Registra a primeira publicação no relógio do banco.
-- Não preenche atividades antigas e não altera preço, PDF, pedido nem permissão.
-- A publicação existente é criar_atividade: ela insere a atividade já visível.
-- O gatilho grava now() nesse insert e ignora qualquer data enviada pelo navegador.
-- Edição, capa, PDF, retirada e republicação apenas atualizam a linha, então a data permanece.
-- Uma linha inserida já fora da loja continua com data nula.

begin;

alter table public.atividades
  add column if not exists publicada_em timestamptz;

comment on column public.atividades.publicada_em is
  'Horário da primeira publicação, gerado pelo banco. Fica nulo enquanto a atividade não entra na loja.';

create or replace function public.registrar_primeira_publicacao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.arquivada_em is null then
      new.publicada_em := now();
    else
      new.publicada_em := null;
    end if;
    return new;
  end if;

  new.publicada_em := old.publicada_em;
  return new;
end;
$$;

drop trigger if exists registrar_primeira_publicacao on public.atividades;
create trigger registrar_primeira_publicacao
before insert or update on public.atividades
for each row
execute function public.registrar_primeira_publicacao();

revoke all on function public.registrar_primeira_publicacao() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
