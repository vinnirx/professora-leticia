-- Rode uma vez no SQL Editor do Supabase, depois de criar o projeto.
-- Em Authentication > Providers > Email, desligue "Confirm email"
-- para a mãe entrar na hora em que criar a conta.
-- Em Authentication > Settings, deixe a senha mínima em 8 caracteres.
-- Administradores: estes e-mails viram admin no cadastro.
-- A senha não fica neste arquivo. A Letícia cria a conta com o e-mail dela.
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
values ('adicao', 'Situações-problema de adição com apoio visual — resultados até 20', 10, 'situacoes-problema-adicao.pdf')
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

alter table public.atividades add column if not exists resumo text not null default '';
alter table public.atividades add column if not exists explicacao text not null default '';
alter table public.atividades add column if not exists uso text not null default 'AEE e sala regular';
alter table public.atividades add column if not exists inclui text not null default '';
alter table public.atividades add column if not exists habilidades text not null default '';

update public.atividades
set
  uso = 'AEE e sala regular',
  resumo = 'Situações do cotidiano para somar com resultado até 20. As ilustrações ajudam a contar, e cada questão traz alternativas e espaço para resolver.',
  inclui = E'4 páginas para imprimir\nContagem com ilustrações\nMúltipla escolha e espaço para resolver',
  explicacao = E'Esta atividade foi desenvolvida para estimular o raciocínio lógico-matemático, a interpretação de enunciados e a resolução de situações-problema envolvendo a operação de adição.\nPor meio de situações contextualizadas no cotidiano, os estudantes são convidados a realizar cálculos de adição com resultados até 20, utilizando ilustrações coloridas como apoio para a contagem e a compreensão das quantidades.\nO material apresenta questões de múltipla escolha, representações visuais das operações e espaços destinados à resolução, favorecendo a utilização de diferentes estratégias matemáticas.\nA proposta pode ser desenvolvida tanto no Atendimento Educacional Especializado (AEE) quanto nas turmas do ensino regular, contribuindo para a promoção da acessibilidade curricular e a construção de aprendizagens significativas, considerando as singularidades, as potencialidades e os diferentes ritmos de aprendizagem dos estudantes.',
  habilidades = E'Desenvolver a contagem e a relação entre números e quantidades.\nCompreender o conceito de adição por meio de situações contextualizadas.\nEstimular a leitura, a compreensão e a interpretação de situações-problema.\nAmpliar o raciocínio lógico-matemático e a construção do pensamento matemático.\nFavorecer a atenção, a concentração e a organização das informações.\nExplorar diferentes estratégias de cálculo e resolução de problemas.\nIncentivar a autonomia e a confiança na realização das atividades matemáticas.'
where id = 'adicao' and explicacao = '';

insert into public.administradores (email)
values ('leticiapimenteldemacedo@gmail.com')
on conflict (email) do nothing;

delete from public.administradores
where email = 'leticiapimenteldemace@gmail.com';

create or replace function public.criar_atividade(
  atividade_id text,
  atividade_titulo text,
  atividade_resumo text,
  atividade_explicacao text,
  atividade_preco numeric,
  atividade_uso text,
  atividade_inclui text,
  atividade_habilidades text
)
returns public.atividades
language plpgsql
security definer
set search_path = public
as $$
declare
  novo public.atividades;
begin
  if not public.sou_admin() then
    raise exception 'Sem permissão.';
  end if;
  if atividade_id is null or atividade_id !~ '^[a-z0-9-]{1,48}$' then
    raise exception 'Diga qual é a atividade.';
  end if;
  if length(trim(atividade_titulo)) < 3 then
    raise exception 'Diga qual é a atividade.';
  end if;
  if length(trim(atividade_resumo)) < 10 then
    raise exception 'Escreva uma descrição breve.';
  end if;
  if length(trim(atividade_explicacao)) < 20 then
    raise exception 'Explique o que a pessoa pode esperar.';
  end if;
  if atividade_preco is null or atividade_preco <= 0 then
    raise exception 'O valor precisa ser maior que zero.';
  end if;
  insert into public.atividades (id, titulo, preco, arquivo, resumo, explicacao, uso, inclui, habilidades)
  values (
    atividade_id,
    trim(atividade_titulo),
    atividade_preco,
    atividade_id || '.pdf',
    trim(atividade_resumo),
    trim(atividade_explicacao),
    coalesce(nullif(trim(atividade_uso), ''), 'AEE e sala regular'),
    coalesce(atividade_inclui, ''),
    coalesce(atividade_habilidades, '')
  )
  returning * into novo;
  return novo;
exception
  when unique_violation then
    raise exception 'Já existe uma atividade com esse nome.';
end;
$$;

revoke all on function public.criar_atividade(text, text, text, text, numeric, text, text, text) from public, anon;
grant execute on function public.criar_atividade(text, text, text, text, numeric, text, text, text) to authenticated;

alter table public.pedidos drop constraint if exists pedidos_txid_key;
create unique index if not exists pedidos_txid_atividade_unico on public.pedidos (txid, atividade_id);

create or replace function public.criar_pedidos(atividades text[], codigo text)
returns setof public.pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.atividades;
  pedido_codigo text := trim(codigo);
begin
  if auth.uid() is null then
    raise exception 'Entre na conta para comprar.';
  end if;
  if pedido_codigo is null or length(pedido_codigo) < 8 then
    raise exception 'Código do pedido inválido.';
  end if;
  if atividades is null or cardinality(atividades) < 1 then
    raise exception 'O carrinho está vazio.';
  end if;
  if (select count(distinct id) from public.atividades where id = any(atividades))
     <> (select count(distinct id) from unnest(atividades) as pedido(id)) then
    raise exception 'Atividade indisponível.';
  end if;
  for item in
    select * from public.atividades where id = any(atividades)
  loop
    insert into public.pedidos (usuario_id, atividade_id, titulo, valor, txid)
    values (auth.uid(), item.id, item.titulo, item.preco, pedido_codigo);
  end loop;
  return query
    select * from public.pedidos
    where usuario_id = auth.uid() and txid = pedido_codigo;
end;
$$;

create or replace function public.confirmar_pix(pedido uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo public.pedidos;
begin
  if not public.sou_admin() then
    raise exception 'Sem permissão.';
  end if;
  select * into alvo from public.pedidos where id = pedido;
  if not found then
    raise exception 'Pedido não encontrado.';
  end if;
  update public.pedidos
  set status = 'pago'
  where txid = alvo.txid
    and usuario_id = alvo.usuario_id
    and status = 'aguardando';
end;
$$;

revoke all on function public.criar_pedidos(text[], text) from public, anon;
grant execute on function public.criar_pedidos(text[], text) to authenticated;
