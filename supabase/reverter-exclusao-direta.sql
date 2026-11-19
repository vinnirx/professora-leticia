-- Devolve a exclusão que só aceita atividade já fora da vitrine.
-- Não recria cadastros apagados e não altera pedidos, direitos nem arquivos.

create or replace function public.apagar_atividade_sem_venda(atividade text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  motivo text := public.motivo_dona_atividade();
  item public.atividades;
  vendas integer;
  direitos integer;
begin
  if motivo <> '' then
    return jsonb_build_object('ok', false, 'mensagem', motivo);
  end if;
  select * into item from public.atividades where id = atividade;
  if not found then
    return jsonb_build_object('ok', false, 'mensagem', 'Atividade não encontrada.');
  end if;
  if item.arquivada_em is null then
    return jsonb_build_object('ok', false, 'mensagem', 'Arquive a atividade antes de apagar o cadastro.');
  end if;
  select count(*) into vendas from public.pedidos where atividade_id = atividade;
  select count(*) into direitos from public.direitos_acesso where atividade_id = atividade;
  if vendas > 0 or direitos > 0 then
    return jsonb_build_object('ok', false, 'mensagem', 'Esta atividade já tem venda ou download. O cadastro e o PDF permanecem.');
  end if;
  delete from public.atividades where id = atividade;
  insert into public.auditoria_atividades (executado_por, atividade_id, operacao, resultado, detalhe)
  values (auth.uid(), atividade, 'apagar_cadastro', 'sucesso', item.titulo);
  return jsonb_build_object('ok', true, 'mensagem', 'O cadastro foi apagado. O PDF no espaço privado não foi removido.');
end;
$$;

revoke all on function public.apagar_atividade_sem_venda(text) from public, anon;
grant execute on function public.apagar_atividade_sem_venda(text) to authenticated;
