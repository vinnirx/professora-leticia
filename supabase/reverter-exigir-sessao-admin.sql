-- Remove a exigência de sessão ativa das funções administrativas.
-- Não apaga sessão, pedido, PDF nem conta.
-- Rode somente para desfazer migracao-exigir-sessao-admin.sql.
-- Se migracao-aal2-admin.sql estiver aplicada, desfaça essa antes.

create or replace function public.sou_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid()
      and papel in ('admin', 'super_admin', 'owner')
  );
$$;

create or replace function public.pode_ver_financeiro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid()
      and (
        papel in ('owner', 'super_admin')
        or (papel = 'admin' and acesso_financeiro)
      )
  );
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

  if autor = alvo then
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
  if autor = alvo then
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
begin
  if auth.uid() is distinct from public.id_proprietaria() then
    raise exception 'Sem permissão.';
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
  return '';
end;
$$;

revoke all on function public.motivo_proprietaria() from public, anon, authenticated;
