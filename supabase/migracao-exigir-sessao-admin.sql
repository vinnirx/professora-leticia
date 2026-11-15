-- NÃO APLICAR sem autorização e sem um backup recuperável.
-- Liga a sessão ativa às operações administrativas.
-- Não exige aal2. Um administrador com sessão válida continua em aal1.
-- Não altera pedidos, PDFs, preços nem cargos existentes.

create or replace function public.sou_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfis
    where id = auth.uid()
      and papel in ('admin', 'super_admin', 'owner')
  )
  and public.sessao_ainda_valida();
$$;

create or replace function public.pode_ver_financeiro()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfis
    where id = auth.uid()
      and (
        papel in ('owner', 'super_admin')
        or (papel = 'admin' and acesso_financeiro)
      )
  )
  and public.sessao_ainda_valida();
$$;

create or replace function public.definir_papel(alvo uuid, novo_papel text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  autor uuid := auth.uid();
  dona uuid := public.id_proprietaria();
  autor_papel text;
  alvo_papel text;
  emitido numeric;
  recente boolean;
  mensagem text := '';
begin
  if autor is null then
    raise exception 'Entre na conta para continuar.';
  end if;
  if alvo is null or novo_papel is null or novo_papel not in ('cliente', 'admin', 'super_admin') then
    raise exception 'Pedido inválido.';
  end if;
  select papel into autor_papel from public.perfis where id = autor;
  select papel into alvo_papel from public.perfis where id = alvo;
  if alvo_papel is null then
    raise exception 'Usuário não encontrado.';
  end if;

  emitido := nullif(auth.jwt() ->> 'iat', '')::numeric;
  recente := emitido is not null and extract(epoch from now()) - emitido < 300;

  if not public.sessao_ainda_valida() then
    mensagem := 'Esta sessão não está mais ativa.';
  elsif autor = alvo then
    mensagem := 'Você não pode alterar o próprio cargo.';
  elsif alvo = dona or alvo_papel = 'owner' or novo_papel = 'owner' then
    mensagem := 'A proprietária não pode ser alterada.';
  elsif autor is distinct from dona and autor_papel is distinct from 'super_admin' then
    mensagem := 'Sem permissão.';
  elsif autor_papel = 'super_admin' and (alvo_papel = 'super_admin' or novo_papel = 'super_admin') then
    mensagem := 'Só a proprietária altera Super Admin.';
  elsif autor_papel = 'super_admin' and novo_papel not in ('admin', 'cliente') then
    mensagem := 'Sem permissão.';
  elsif autor = dona and (novo_papel = 'super_admin' or alvo_papel = 'super_admin') and not recente then
    mensagem := 'Confirme sua senha de novo para alterar Super Admin.';
  end if;

  if mensagem <> '' then
    insert into public.auditoria_permissoes (
      executado_por, afetado, papel_anterior, papel_novo, operacao, resultado, detalhe
    ) values (
      autor, alvo, alvo_papel, novo_papel, 'definir_papel', 'negado', mensagem
    );
    return jsonb_build_object('ok', false, 'mensagem', mensagem);
  end if;

  perform set_config('app.alterar_cargo', 'sim', true);
  update public.perfis
  set
    papel = novo_papel,
    acesso_financeiro = case
      when novo_papel = 'super_admin' then true
      when novo_papel = 'cliente' then false
      else false
    end
  where id = alvo;
  perform set_config('app.alterar_cargo', '', true);

  insert into public.auditoria_permissoes (
    executado_por, afetado, papel_anterior, papel_novo, operacao, resultado, detalhe
  ) values (
    autor, alvo, alvo_papel, novo_papel, 'definir_papel', 'sucesso', ''
  );
  return jsonb_build_object('ok', true, 'mensagem', '');
end;
$$;

create or replace function public.definir_financeiro(alvo uuid, ligado boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  autor uuid := auth.uid();
  dona uuid := public.id_proprietaria();
  autor_papel text;
  alvo_papel text;
  mensagem text := '';
begin
  if autor is null then
    raise exception 'Entre na conta para continuar.';
  end if;
  if alvo is null or ligado is null then
    raise exception 'Pedido inválido.';
  end if;
  select papel into autor_papel from public.perfis where id = autor;
  select papel into alvo_papel from public.perfis where id = alvo;
  if alvo_papel is null then
    raise exception 'Usuário não encontrado.';
  end if;
  if not public.sessao_ainda_valida() then
    mensagem := 'Esta sessão não está mais ativa.';
  elsif autor = alvo then
    mensagem := 'Você não pode alterar o próprio cargo.';
  elsif alvo = dona or alvo_papel = 'owner' or alvo_papel = 'super_admin' then
    mensagem := 'Esse cargo já inclui o financeiro.';
  elsif alvo_papel is distinct from 'admin' then
    mensagem := 'O financeiro específico vale para administrador comum.';
  elsif autor is distinct from dona and autor_papel is distinct from 'super_admin' then
    mensagem := 'Sem permissão.';
  end if;
  if mensagem <> '' then
    insert into public.auditoria_permissoes (
      executado_por, afetado, papel_anterior, papel_novo, operacao, resultado, detalhe
    ) values (
      autor, alvo, alvo_papel, alvo_papel, 'definir_financeiro', 'negado', mensagem
    );
    return jsonb_build_object('ok', false, 'mensagem', mensagem);
  end if;
  perform set_config('app.alterar_cargo', 'sim', true);
  update public.perfis set acesso_financeiro = ligado where id = alvo;
  perform set_config('app.alterar_cargo', '', true);
  insert into public.auditoria_permissoes (
    executado_por, afetado, papel_anterior, papel_novo, operacao, resultado, detalhe
  ) values (
    autor, alvo, alvo_papel, alvo_papel, 'definir_financeiro', 'sucesso',
    case when ligado then 'financeiro ligado' else 'financeiro desligado' end
  );
  return jsonb_build_object('ok', true, 'mensagem', '');
end;
$$;

create or replace function public.motivo_proprietaria()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or auth.uid() is distinct from public.id_proprietaria() then
    return 'Sem permissão.';
  end if;
  if not public.sessao_ainda_valida() then
    return 'Esta sessão não está mais ativa.';
  end if;
  return '';
end;
$$;

revoke all on function public.motivo_proprietaria() from public, anon, authenticated;

create or replace function public.listar_conciliacao()
returns table (
  usuario_id uuid,
  email text,
  atividade_id text,
  titulo text,
  valor numeric,
  txid text,
  criado_em timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  motivo text := public.motivo_proprietaria();
begin
  if motivo <> '' then
    raise exception '%', motivo;
  end if;
  return query
  select pedido.usuario_id, perfil.email, pedido.atividade_id, pedido.titulo, pedido.valor, pedido.txid, pedido.criado_em
  from public.pedidos as pedido
  join public.perfis as perfil on perfil.id = pedido.usuario_id
  where pedido.status = 'pago'
    and pedido.confirmacao is null
    and pedido.legado
  order by pedido.criado_em;
end;
$$;

create or replace function public.conciliar_pedido(codigo text, confirmar boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  quantidade integer;
  autor uuid := auth.uid();
  motivo text := public.motivo_proprietaria();
begin
  if motivo <> '' then
    raise exception '%', motivo;
  end if;
  if confirmar is distinct from true then
    return jsonb_build_object('ok', false, 'mensagem', 'Confirme explicitamente antes de liberar a compra antiga.');
  end if;
  if codigo is null or length(trim(codigo)) < 8 then
    raise exception 'Pedido inválido.';
  end if;
  update public.pedidos
  set confirmacao = 'legado_conferido'
  where txid = trim(codigo)
    and status = 'pago'
    and legado
    and confirmacao is null;
  get diagnostics quantidade = row_count;
  if quantidade = 0 then
    return jsonb_build_object('ok', false, 'mensagem', 'Não há compra antiga paga sem conferência com esse código.');
  end if;
  insert into public.direitos_acesso (usuario_id, atividade_id, txid, origem)
  select distinct usuario_id, atividade_id, txid, 'compra'
  from public.pedidos
  where txid = trim(codigo) and status = 'pago' and confirmacao = 'legado_conferido'
  on conflict (usuario_id, atividade_id) do update
  set txid = excluded.txid, origem = 'compra', revogado_em = null, concedido_em = now();
  insert into public.auditoria_conciliacao (conciliado_por, txid, quantidade)
  values (autor, trim(codigo), quantidade);
  return jsonb_build_object('ok', true, 'quantidade', quantidade);
end;
$$;

create or replace function public.encerrar_conciliacao()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pendentes integer;
  autor uuid := auth.uid();
  motivo text := public.motivo_proprietaria();
begin
  if motivo <> '' then
    raise exception '%', motivo;
  end if;
  select count(*) into pendentes
  from public.pedidos
  where legado and status = 'pago' and confirmacao is null;
  if pendentes > 0 then
    return jsonb_build_object('ok', false, 'pendentes', pendentes, 'mensagem', 'Ainda há compra antiga sem conciliação. O acesso delas continua.');
  end if;
  update public.controle_conciliacao
  set aberta = false, encerrada_em = now(), encerrada_por = autor
  where id = 1;
  return jsonb_build_object('ok', true, 'mensagem', 'A exceção das compras antigas foi encerrada.');
end;
$$;

create or replace function public.resumo_conciliacao()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  legados integer;
  conciliados integer;
  pendentes integer;
  direitos integer;
  sem_vinculo integer;
  aberta boolean;
  motivo text := public.motivo_proprietaria();
begin
  if motivo <> '' then
    raise exception '%', motivo;
  end if;
  select count(*) into legados from public.pedidos where legado;
  select count(*) into conciliados from public.pedidos where legado and confirmacao = 'legado_conferido';
  select count(*) into pendentes from public.pedidos where legado and status = 'pago' and confirmacao is null;
  select count(*) into direitos from public.direitos_acesso where revogado_em is null;
  select count(*) into sem_vinculo
  from public.pedidos as pedido
  where pedido.legado
    and pedido.confirmacao = 'legado_conferido'
    and not exists (
      select 1 from public.direitos_acesso as direito
      where direito.usuario_id = pedido.usuario_id
        and direito.atividade_id = pedido.atividade_id
        and direito.revogado_em is null
    );
  select controle.aberta into aberta from public.controle_conciliacao as controle where controle.id = 1;
  return jsonb_build_object(
    'legados', legados,
    'conciliados', conciliados,
    'pendentes', pendentes,
    'direitos_ativos', direitos,
    'conciliados_sem_direito', sem_vinculo,
    'excecao_aberta', coalesce(aberta, false)
  );
end;
$$;

create or replace function public.historico_permissoes()
returns table (
  id uuid,
  executado_por uuid,
  afetado uuid,
  papel_anterior text,
  papel_novo text,
  operacao text,
  resultado text,
  detalhe text,
  criado_em timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  motivo text := public.motivo_proprietaria();
begin
  if motivo <> '' then
    raise exception '%', motivo;
  end if;
  return query
  select
    registro.id,
    registro.executado_por,
    registro.afetado,
    registro.papel_anterior,
    registro.papel_novo,
    registro.operacao,
    registro.resultado,
    registro.detalhe,
    registro.criado_em
  from public.auditoria_permissoes as registro
  order by registro.criado_em desc
  limit 100;
end;
$$;

revoke all on function public.listar_conciliacao() from public, anon;
grant execute on function public.listar_conciliacao() to authenticated;
revoke all on function public.conciliar_pedido(text, boolean) from public, anon;
grant execute on function public.conciliar_pedido(text, boolean) to authenticated;
revoke all on function public.encerrar_conciliacao() from public, anon;
grant execute on function public.encerrar_conciliacao() to authenticated;
revoke all on function public.resumo_conciliacao() from public, anon;
grant execute on function public.resumo_conciliacao() to authenticated;
revoke all on function public.historico_permissoes() from public, anon;
grant execute on function public.historico_permissoes() to authenticated;
