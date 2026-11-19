-- Exclusão direta de atividade sem venda, publicada ou já fora da vitrine.
-- Não exige arquivamento prévio.
-- Não apaga pedido, direito, cobrança, capa nem PDF.
-- Só a proprietária, com sessão válida, recebe sucesso.
-- Não altera RLS, papéis, financeiro nem o segundo fator.
-- Reversão: supabase/reverter-exclusao-direta.sql
-- Essa reversão devolve a exigência de arquivar antes de apagar,
-- sem restaurar cadastros já removidos e sem mexer em pedidos.

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
  cobrancas integer;
begin
  if motivo <> '' then
    return jsonb_build_object('ok', false, 'mensagem', motivo);
  end if;
  select * into item from public.atividades where id = atividade;
  if not found then
    return jsonb_build_object('ok', false, 'mensagem', 'Atividade não encontrada.');
  end if;
  select count(*) into vendas from public.pedidos where atividade_id = atividade;
  select count(*) into direitos from public.direitos_acesso where atividade_id = atividade;
  select count(*) into cobrancas
  from public.cobrancas c
  where exists (
    select 1
    from public.pedidos p
    where p.atividade_id = atividade
      and p.txid = c.txid
  );
  if vendas > 0 or direitos > 0 or cobrancas > 0 then
    return jsonb_build_object(
      'ok', false,
      'mensagem', 'Esta atividade já tem venda, cobrança ou download. O cadastro e o PDF permanecem.'
    );
  end if;
  delete from public.atividades where id = atividade;
  insert into public.auditoria_atividades (executado_por, atividade_id, operacao, resultado, detalhe)
  values (auth.uid(), atividade, 'apagar_cadastro', 'sucesso', item.titulo);
  return jsonb_build_object(
    'ok', true,
    'mensagem', 'A atividade saiu do catálogo. A capa e o PDF não foram apagados.'
  );
end;
$$;

revoke all on function public.apagar_atividade_sem_venda(text) from public, anon;
grant execute on function public.apagar_atividade_sem_venda(text) to authenticated;
