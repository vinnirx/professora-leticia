-- NÃO APLICAR em produção sem autorização específica.
-- Arquiva a atividade. Não apaga pedido, PDF, direito de download nem histórico.
-- Só a proprietária executa. Sessão ativa e aal2 entram quando migracao-aal2-admin.sql for aplicada de novo.
-- Reversão: supabase/reverter-arquivar-atividade.sql

alter table public.atividades
  add column if not exists arquivada_em timestamptz,
  add column if not exists arquivada_por uuid;

create table if not exists public.auditoria_atividades (
  id uuid primary key default gen_random_uuid(),
  executado_por uuid,
  atividade_id text not null,
  operacao text not null,
  resultado text not null,
  detalhe text not null default '',
  criado_em timestamptz not null default now()
);

revoke all on public.auditoria_atividades from public, anon, authenticated;

create or replace function public.motivo_dona_atividade()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or auth.uid() is distinct from public.id_proprietaria() then
    return 'Só a proprietária pode retirar ou repor uma atividade.';
  end if;
  return '';
end;
$$;

revoke all on function public.motivo_dona_atividade() from public, anon, authenticated;

create or replace function public.arquivar_atividade(atividade text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  motivo text := public.motivo_dona_atividade();
  item public.atividades;
begin
  if motivo <> '' then
    return jsonb_build_object('ok', false, 'mensagem', motivo);
  end if;
  select * into item from public.atividades where id = atividade;
  if not found then
    return jsonb_build_object('ok', false, 'mensagem', 'Atividade não encontrada.');
  end if;
  if item.arquivada_em is not null then
    return jsonb_build_object('ok', true, 'mensagem', 'Esta atividade já está fora da loja.');
  end if;
  update public.atividades
  set arquivada_em = now(), arquivada_por = auth.uid()
  where id = atividade;
  insert into public.auditoria_atividades (executado_por, atividade_id, operacao, resultado, detalhe)
  values (auth.uid(), atividade, 'arquivar', 'sucesso', item.titulo);
  return jsonb_build_object('ok', true, 'mensagem', 'A atividade saiu da loja. Quem já comprou continua com o PDF.');
end;
$$;

create or replace function public.restaurar_atividade(atividade text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  motivo text := public.motivo_dona_atividade();
  item public.atividades;
begin
  if motivo <> '' then
    return jsonb_build_object('ok', false, 'mensagem', motivo);
  end if;
  select * into item from public.atividades where id = atividade;
  if not found then
    return jsonb_build_object('ok', false, 'mensagem', 'Atividade não encontrada.');
  end if;
  if item.arquivada_em is null then
    return jsonb_build_object('ok', true, 'mensagem', 'Esta atividade já está à venda.');
  end if;
  if coalesce(trim(item.arquivo), '') = '' or item.preco is null or item.preco <= 0 then
    return jsonb_build_object('ok', false, 'mensagem', 'Antes de voltar à loja, a atividade precisa de preço e PDF.');
  end if;
  update public.atividades
  set arquivada_em = null, arquivada_por = null
  where id = atividade;
  insert into public.auditoria_atividades (executado_por, atividade_id, operacao, resultado, detalhe)
  values (auth.uid(), atividade, 'restaurar', 'sucesso', item.titulo);
  return jsonb_build_object('ok', true, 'mensagem', 'A atividade voltou para a loja.');
end;
$$;

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

revoke all on function public.arquivar_atividade(text) from public, anon;
revoke all on function public.restaurar_atividade(text) from public, anon;
revoke all on function public.apagar_atividade_sem_venda(text) from public, anon;
grant execute on function public.arquivar_atividade(text) to authenticated;
grant execute on function public.restaurar_atividade(text) to authenticated;
grant execute on function public.apagar_atividade_sem_venda(text) to authenticated;

create or replace function public.impedir_compra_arquivada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  retirada timestamptz;
begin
  select arquivada_em into retirada from public.atividades where id = new.atividade_id;
  if not found or retirada is not null then
    raise exception 'Esta atividade não está mais à venda.';
  end if;
  return new;
end;
$$;

drop trigger if exists impedir_compra_arquivada on public.pedidos;
create trigger impedir_compra_arquivada
before insert on public.pedidos
for each row execute function public.impedir_compra_arquivada();

drop policy if exists "atividades a vista" on public.atividades;
create policy "atividades a vista"
on public.atividades for select
to anon, authenticated
using (arquivada_em is null or public.sou_admin());
