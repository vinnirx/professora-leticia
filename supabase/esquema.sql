-- Rode uma vez no SQL Editor do Supabase, depois de criar o projeto.
-- Em Authentication > Providers > Email, desligue "Confirm email"
-- para a mãe entrar na hora em que criar a conta.
-- Administradores: estes e-mails viram admin no cadastro.
-- Troque o e-mail do Vinícius no insert se não for este.

create table if not exists public.administradores (
  email text primary key
);

insert into public.administradores (email)
values
  ('leticiapimenteldemacedo@gmail.com'),
  ('vinnirx@gmail.com')
on conflict (email) do nothing;

create table if not exists public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  email text not null unique,
  papel text not null default 'cliente' check (papel in ('cliente', 'admin'))
);

create table if not exists public.atividades (
  id text primary key,
  titulo text not null,
  preco numeric(10, 2) not null check (preco > 0),
  arquivo text not null
);

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  atividade_id text not null references public.atividades (id),
  titulo text not null,
  valor numeric(10, 2) not null check (valor > 0),
  txid text not null unique,
  status text not null default 'aguardando' check (status in ('aguardando', 'pago')),
  criado_em timestamptz not null default now()
);

insert into public.atividades (id, titulo, preco, arquivo)
values ('adicao', 'Situações-problema de adição com apoio visual', 10, 'situacoes-problema-adicao.pdf')
on conflict (id) do update
set titulo = excluded.titulo, preco = excluded.preco, arquivo = excluded.arquivo;

create or replace function public.sou_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and papel = 'admin'
  );
$$;

create or replace function public.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, nome, email, papel)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'nome'), ''), split_part(new.email, '@', 1)),
    new.email,
    case
      when exists (
        select 1 from public.administradores
        where lower(email) = lower(new.email)
      ) then 'admin'
      else 'cliente'
    end
  );
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
after insert on auth.users
for each row execute function public.criar_perfil();

create or replace function public.criar_pedido(atividade text, txid text)
returns public.pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.atividades;
  novo public.pedidos;
begin
  if auth.uid() is null then
    raise exception 'Entre na conta para comprar.';
  end if;
  if txid is null or length(trim(txid)) < 8 then
    raise exception 'Código do pedido inválido.';
  end if;
  select * into item from public.atividades where id = atividade;
  if not found then
    raise exception 'Atividade indisponível.';
  end if;
  insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid)
  values (auth.uid(), item.id, item.titulo, item.preco, trim(txid))
  returning * into novo;
  return novo;
end;
$$;

create or replace function public.confirmar_pix(pedido uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sou_admin() then
    raise exception 'Sem permissão.';
  end if;
  update public.pedidos
  set status = 'pago'
  where id = pedido and status = 'aguardando';
end;
$$;

revoke all on function public.criar_perfil() from public, anon, authenticated;
revoke all on function public.sou_admin() from public, anon;
grant execute on function public.sou_admin() to authenticated;
revoke all on function public.criar_pedido(text, text) from public, anon;
grant execute on function public.criar_pedido(text, text) to authenticated;
revoke all on function public.confirmar_pix(uuid) from public, anon;
grant execute on function public.confirmar_pix(uuid) to authenticated;

alter table public.administradores enable row level security;
alter table public.perfis enable row level security;
alter table public.atividades enable row level security;
alter table public.pedidos enable row level security;

revoke all on public.administradores from anon, authenticated;
revoke all on public.perfis from anon, authenticated;
grant select on public.perfis to authenticated;
revoke all on public.pedidos from anon, authenticated;
grant select on public.pedidos to authenticated;
revoke all on public.atividades from anon, authenticated;
grant select on public.atividades to anon, authenticated;

drop policy if exists "ve a propria conta" on public.perfis;
create policy "ve a propria conta"
on public.perfis for select
to authenticated
using (id = auth.uid() or public.sou_admin());

drop policy if exists "ve os proprios pedidos" on public.pedidos;
create policy "ve os proprios pedidos"
on public.pedidos for select
to authenticated
using (usuario_id = auth.uid() or public.sou_admin());

drop policy if exists "atividades a vista" on public.atividades;
create policy "atividades a vista"
on public.atividades for select
to anon, authenticated
using (true);

insert into storage.buckets (id, name, public)
values ('atividades', 'atividades', false)
on conflict (id) do nothing;

drop policy if exists "quem pagou baixa" on storage.objects;
create policy "quem pagou baixa"
on storage.objects for select
to authenticated
using (
  bucket_id = 'atividades'
  and (
    public.sou_admin()
    or exists (
      select 1 from public.pedidos
      where usuario_id = auth.uid()
        and status = 'pago'
        and atividade_id = split_part(storage.objects.name, '/', 1)
    )
  )
);

drop policy if exists "admin envia atividade" on storage.objects;
create policy "admin envia atividade"
on storage.objects for insert
to authenticated
with check (bucket_id = 'atividades' and public.sou_admin());

drop policy if exists "admin substitui atividade" on storage.objects;
create policy "admin substitui atividade"
on storage.objects for update
to authenticated
using (bucket_id = 'atividades' and public.sou_admin());
