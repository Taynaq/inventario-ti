-- Inventário de TI: estrutura do banco no Supabase (Postgres).
--
-- Como usar: Supabase > SQL Editor > New query > cole este arquivo inteiro > Run.
-- Pode rodar de novo sem problema (tudo é "se não existir" ou "substituir").
--
-- Quem pode usar o inventário:
--   1. a pessoa precisa estar logada (e-mail confirmado), e
--   2. o e-mail dela precisa estar na tabela allowed_emails.
-- Quem não está na lista entra no app, mas não vê nem altera nada.

-- ---------------------------------------------------------------- acesso
create table if not exists public.allowed_emails (
  email text primary key check (email = lower(email))
);

-- RLS ligado e nenhuma policy: o app não consegue ler nem escrever aqui.
-- Quem administra a lista é você, pelo painel do Supabase (Table Editor).
alter table public.allowed_emails enable row level security;

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_emails
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_member() from public;
grant execute on function public.is_member() to authenticated;

-- ----------------------------------------------------------- equipamentos
create table if not exists public.equipamentos (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(btrim(name)) > 0),
  category      text not null default 'outro'
                check (category in ('notebook','desktop','celular','tablet','monitor',
                                    'impressora','rede','periferico','servidor','outro')),
  status        text not null default 'uso'
                check (status in ('uso','estoque','manutencao','baixado')),
  owner         text not null default '',
  brand         text not null default '',
  serial        text not null default '',
  tag           text not null default '',
  location      text not null default '',
  buy_date      date,
  warranty_end  date,
  value         numeric(12,2) check (value is null or value >= 0),
  notes         text not null default '',
  is_example    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null
);

create index if not exists equipamentos_status_idx on public.equipamentos (status);

-- Preenche sozinho quem alterou e quando.
create or replace function public.equipamentos_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists equipamentos_touch on public.equipamentos;
create trigger equipamentos_touch
  before insert or update on public.equipamentos
  for each row execute function public.equipamentos_touch();

alter table public.equipamentos enable row level security;

drop policy if exists "membros leem" on public.equipamentos;
create policy "membros leem" on public.equipamentos
  for select to authenticated using (public.is_member());

drop policy if exists "membros criam" on public.equipamentos;
create policy "membros criam" on public.equipamentos
  for insert to authenticated with check (public.is_member());

drop policy if exists "membros alteram" on public.equipamentos;
create policy "membros alteram" on public.equipamentos
  for update to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists "membros excluem" on public.equipamentos;
create policy "membros excluem" on public.equipamentos
  for delete to authenticated using (public.is_member());

-- ------------------------------------------------------------ tempo real
-- Mudanças feitas por uma pessoa aparecem na tela das outras sem recarregar.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'equipamentos'
  ) then
    alter publication supabase_realtime add table public.equipamentos;
  end if;
end $$;

-- ------------------------------------------------------ primeira liberação
-- Troque pelo seu e-mail (em minúsculas) e rode. Depois, para liberar mais pessoas,
-- basta adicionar linhas na tabela allowed_emails pelo painel (Table Editor).
--
-- insert into public.allowed_emails (email) values ('voce@suaempresa.com.br')
--   on conflict do nothing;
