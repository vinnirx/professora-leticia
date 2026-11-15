-- Central de ajuda e consulta administrativa das contas.
-- NÃO execute este arquivo sem autorização.
-- Não altera atividades, pedidos, PDFs nem cargos existentes.

begin;

create table if not exists public.solicitacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfis (id),
  txid text not null default '' check (char_length(txid) <= 80),
  assunto text not null check (assunto in ('pagamento', 'download', 'acesso', 'material', 'reembolso', 'outro')),
  status text not null default 'aberto' check (status in ('aberto', 'atendimento', 'resolvido')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.solicitacao_mensagens (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes (id) on delete cascade,
  autor_id uuid not null references public.perfis (id),
  texto text not null check (char_length(texto) between 1 and 2000),
  criado_em timestamptz not null default now()
);

alter table public.solicitacoes enable row level security;
alter table public.solicitacao_mensagens enable row level security;

revoke all on public.solicitacoes from anon, authenticated;
revoke all on public.solicitacao_mensagens from anon, authenticated;
grant select, insert, update on public.solicitacoes to authenticated;
grant select, insert on public.solicitacao_mensagens to authenticated;

drop policy if exists "ve a propria ajuda" on public.solicitacoes;
create policy "ve a propria ajuda"
on public.solicitacoes for select
to authenticated
using (usuario_id = auth.uid() or public.sou_admin());

drop policy if exists "abre a propria ajuda" on public.solicitacoes;
create policy "abre a propria ajuda"
on public.solicitacoes for insert
to authenticated
with check (usuario_id = auth.uid());

drop policy if exists "admin atualiza ajuda" on public.solicitacoes;
create policy "admin atualiza ajuda"
on public.solicitacoes for update
to authenticated
using (public.sou_admin())
with check (public.sou_admin());

drop policy if exists "ve mensagens da propria ajuda" on public.solicitacao_mensagens;
create policy "ve mensagens da propria ajuda"
on public.solicitacao_mensagens for select
to authenticated
using (
  exists (
    select 1 from public.solicitacoes
    where solicitacoes.id = solicitacao_id
      and (solicitacoes.usuario_id = auth.uid() or public.sou_admin())
  )
);

create or replace function public.proteger_solicitacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null or new.usuario_id is distinct from auth.uid() then
      raise exception 'Sem permissão.';
    end if;
    new.status := 'aberto';
    new.criado_em := now();
    new.atualizado_em := now();
    if coalesce(new.txid, '') <> '' and not exists (
      select 1 from public.pedidos
      where pedidos.txid = new.txid
        and pedidos.usuario_id = auth.uid()
    ) then
      new.txid := '';
    end if;
    return new;
  end if;
  if not public.sou_admin() then
    raise exception 'Sem permissão.';
  end if;
  if new.usuario_id is distinct from old.usuario_id
     or new.criado_em is distinct from old.criado_em then
    raise exception 'Não é possível alterar o dono do chamado.';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists proteger_solicitacao on public.solicitacoes;
create trigger proteger_solicitacao
before insert or update on public.solicitacoes
for each row execute function public.proteger_solicitacao();

revoke all on function public.proteger_solicitacao() from public, anon, authenticated;
grant execute on function public.proteger_solicitacao() to authenticated;

drop policy if exists "escreve na propria ajuda" on public.solicitacao_mensagens;
create policy "escreve na propria ajuda"
on public.solicitacao_mensagens for insert
to authenticated
with check (
  autor_id = auth.uid()
  and exists (
    select 1 from public.solicitacoes
    where solicitacoes.id = solicitacao_id
      and (solicitacoes.usuario_id = auth.uid() or public.sou_admin())
  )
);

create or replace function public.listar_contas(busca text, limite integer, pagina integer)
returns table (
  id uuid,
  nome text,
  email text,
  papel text,
  acesso_financeiro boolean,
  criado_em timestamptz,
  email_confirmado boolean,
  ultimo_acesso timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tamanho integer := least(greatest(coalesce(limite, 20), 1), 50);
  salto integer := greatest(coalesce(pagina, 0), 0) * tamanho;
  termo text := replace(replace(replace(trim(coalesce(busca, '')), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if not public.sou_admin() then
    raise exception 'Sem permissão para ver as contas.';
  end if;
  return query
  select
    perfil.id,
    perfil.nome,
    perfil.email,
    perfil.papel,
    coalesce(perfil.acesso_financeiro, false),
    usuario.created_at,
    usuario.email_confirmed_at is not null,
    usuario.last_sign_in_at
  from public.perfis as perfil
  join auth.users as usuario on usuario.id = perfil.id
  where termo = ''
     or perfil.nome ilike '%' || termo || '%' escape '\'
     or perfil.email ilike '%' || termo || '%' escape '\'
  order by usuario.created_at desc
  limit tamanho
  offset salto;
end;
$$;

revoke all on function public.listar_contas(text, integer, integer) from public, anon;
grant execute on function public.listar_contas(text, integer, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
