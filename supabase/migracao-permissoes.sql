-- Cole este arquivo inteiro no SQL Editor do Supabase e rode uma vez.
-- Não rode o esquema.sql de novo.
-- A Letícia passa a ser a proprietária, pelo UUID da conta que já existe.
-- Quem já administra continua administrador comum, com o financeiro que já via.
-- Ninguém mais vira admin só por criar conta com um e-mail da lista.

alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis
  add constraint perfis_papel_check
  check (papel in ('cliente', 'admin', 'super_admin', 'owner'));

alter table public.perfis
  add column if not exists acesso_financeiro boolean not null default false;

create table if not exists public.proprietaria (
  id integer primary key check (id = 1),
  usuario_id uuid not null
);

create table if not exists public.auditoria_permissoes (
  id uuid primary key default gen_random_uuid(),
  executado_por uuid,
  afetado uuid,
  papel_anterior text,
  papel_novo text,
  operacao text not null,
  resultado text not null,
  detalhe text not null default '',
  criado_em timestamptz not null default now()
);

create or replace function public.id_proprietaria()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select usuario_id from public.proprietaria where id = 1;
$$;

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

create or replace function public.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, nome, email, papel, acesso_financeiro)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'nome'), ''), split_part(new.email, '@', 1)),
    new.email,
    'cliente',
    false
  );
  return new;
end;
$$;

create or replace function public.proteger_cargo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dona uuid;
begin
  if new.papel is not distinct from old.papel
     and new.acesso_financeiro is not distinct from old.acesso_financeiro then
    return new;
  end if;
  if current_setting('app.alterar_cargo', true) is distinct from 'sim' then
    raise exception 'Cargo protegido.';
  end if;
  select usuario_id into dona from public.proprietaria where id = 1;
  if dona is not null and old.id = dona and new.papel is distinct from 'owner' then
    raise exception 'A proprietária não pode ser rebaixada.';
  end if;
  if new.papel = 'owner' and old.papel is distinct from 'owner' and new.id is distinct from dona then
    raise exception 'Não é possível criar outra proprietária.';
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_cargo on public.perfis;
create trigger proteger_cargo
before update on public.perfis
for each row execute function public.proteger_cargo();

create or replace function public.proteger_proprietaria()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.definir_proprietaria', true) is distinct from 'sim' then
    raise exception 'A proprietária não pode ser trocada pelo painel.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_proprietaria on public.proprietaria;
create trigger proteger_proprietaria
before update or delete on public.proprietaria
for each row execute function public.proteger_proprietaria();

do $$
declare
  dona uuid;
  guardada uuid;
begin
  select id into dona
  from auth.users
  where lower(email) = 'leticiapimenteldemacedo@gmail.com'
  order by created_at
  limit 1;
  if dona is null then
    raise exception 'Não encontrei a conta da Letícia. Nada foi alterado.';
  end if;
  if not exists (select 1 from public.perfis where id = dona) then
    raise exception 'A conta da Letícia ainda não tem perfil. Nada foi alterado.';
  end if;
  if not exists (select 1 from public.proprietaria where id = 1) then
    perform set_config('app.alterar_cargo', 'sim', true);
    update public.perfis
    set acesso_financeiro = true
    where papel = 'admin';
    perform set_config('app.alterar_cargo', '', true);
    perform set_config('app.definir_proprietaria', 'sim', true);
    insert into public.proprietaria (id, usuario_id) values (1, dona);
    perform set_config('app.definir_proprietaria', '', true);
  end if;
  select usuario_id into guardada from public.proprietaria where id = 1;
  if guardada is distinct from dona then
    raise exception 'A proprietária já está definida em outra conta e não foi trocada.';
  end if;
  perform set_config('app.alterar_cargo', 'sim', true);
  update public.perfis
  set papel = 'owner', acesso_financeiro = true
  where id = dona;
  perform set_config('app.alterar_cargo', '', true);
end;
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

revoke all on function public.id_proprietaria() from public, anon, authenticated;
revoke all on function public.proteger_cargo() from public, anon, authenticated;
revoke all on function public.proteger_proprietaria() from public, anon, authenticated;
revoke all on function public.definir_papel(uuid, text) from public, anon;
grant execute on function public.definir_papel(uuid, text) to authenticated;
revoke all on function public.definir_financeiro(uuid, boolean) from public, anon;
grant execute on function public.definir_financeiro(uuid, boolean) to authenticated;
revoke all on function public.historico_permissoes() from public, anon;
grant execute on function public.historico_permissoes() to authenticated;

alter table public.proprietaria enable row level security;
alter table public.auditoria_permissoes enable row level security;
revoke all on public.proprietaria from anon, authenticated;
revoke all on public.auditoria_permissoes from anon, authenticated;
revoke update, insert, delete on public.perfis from anon, authenticated;
