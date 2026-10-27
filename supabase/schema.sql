-- Central de Gestão: estrutura do banco no Supabase (Postgres).
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

-- RLS ligado: só administradores (veja o fim deste arquivo) leem e alteram esta lista pelo app.
-- Também dá para editar pelo painel do Supabase (Table Editor).
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

-- ------------------------------------------- administradores e telas liberadas
-- Quem é administrador vê todas as telas e a aba "Acessos", onde libera pessoas.
-- Cada pessoa liberada tem a lista de telas que pode usar (coluna modules).
alter table public.allowed_emails add column if not exists is_admin boolean not null default false;
alter table public.allowed_emails add column if not exists added_at timestamptz not null default now();
alter table public.allowed_emails add column if not exists modules text[] not null default '{inventario}';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_emails
    where email = lower(coalesce(auth.jwt() ->> 'email', '')) and is_admin
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- A pessoa pode usar a tela se for administradora ou se a tela estiver na lista dela.
create or replace function public.has_module(m text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_emails
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and (is_admin or m = any (modules))
  );
$$;

revoke all on function public.has_module(text) from public;
grant execute on function public.has_module(text) to authenticated;

-- Telas que a pessoa que está logada pode usar (o app usa isto para montar o menu).
create or replace function public.my_modules()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case when is_admin then array['inventario','quebras','solicitacoes'] else modules end
       from public.allowed_emails
      where email = lower(coalesce(auth.jwt() ->> 'email', ''))),
    '{}'::text[]
  );
$$;

revoke all on function public.my_modules() from public;
grant execute on function public.my_modules() to authenticated;

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
  for select to authenticated using (public.has_module('inventario'));

drop policy if exists "membros criam" on public.equipamentos;
create policy "membros criam" on public.equipamentos
  for insert to authenticated with check (public.has_module('inventario'));

drop policy if exists "membros alteram" on public.equipamentos;
create policy "membros alteram" on public.equipamentos
  for update to authenticated using (public.has_module('inventario')) with check (public.has_module('inventario'));

drop policy if exists "membros excluem" on public.equipamentos;
create policy "membros excluem" on public.equipamentos
  for delete to authenticated using (public.has_module('inventario'));

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
-- insert into public.allowed_emails (email, is_admin) values ('voce@suaempresa.com.br', true)
--   on conflict (email) do update set is_admin = true;

drop policy if exists "admin lê acessos" on public.allowed_emails;
create policy "admin lê acessos" on public.allowed_emails
  for select to authenticated using (public.is_admin());

drop policy if exists "admin libera acessos" on public.allowed_emails;
create policy "admin libera acessos" on public.allowed_emails
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admin altera acessos" on public.allowed_emails;
create policy "admin altera acessos" on public.allowed_emails
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- O administrador não consegue remover o próprio acesso (evita ficar sem nenhum administrador).
drop policy if exists "admin remove acessos" on public.allowed_emails;
create policy "admin remove acessos" on public.allowed_emails
  for delete to authenticated
  using (public.is_admin() and email <> lower(coalesce(auth.jwt() ->> 'email', '')));

-- ----------------------------------------------------- quebra de máquinas
create table if not exists public.quebras (
  id          uuid primary key default gen_random_uuid(),
  day         date not null,
  machine     text not null check (char_length(btrim(machine)) > 0),
  grp         text not null default '',
  lost_parts  integer not null default 0 check (lost_parts >= 0),
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

create index if not exists quebras_day_idx on public.quebras (day desc);

create or replace function public.quebras_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists quebras_touch on public.quebras;
create trigger quebras_touch
  before insert or update on public.quebras
  for each row execute function public.quebras_touch();

alter table public.quebras enable row level security;

drop policy if exists "quebras leem" on public.quebras;
create policy "quebras leem" on public.quebras
  for select to authenticated using (public.has_module('quebras'));

drop policy if exists "quebras criam" on public.quebras;
create policy "quebras criam" on public.quebras
  for insert to authenticated with check (public.has_module('quebras'));

drop policy if exists "quebras alteram" on public.quebras;
create policy "quebras alteram" on public.quebras
  for update to authenticated
  using (public.has_module('quebras')) with check (public.has_module('quebras'));

drop policy if exists "quebras excluem" on public.quebras;
create policy "quebras excluem" on public.quebras
  for delete to authenticated using (public.has_module('quebras'));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quebras'
  ) then
    alter publication supabase_realtime add table public.quebras;
  end if;
end;
$$;

-- ------------------------------------------- solicitação de acessos
-- Quem tem a tela pede o acesso (loja, setor, nome da pessoa). Só a administração (TI) vê todos os
-- pedidos, muda a situação e escreve as observações. Quem pediu vê só os próprios pedidos.
-- (A tabela antiga "vendedores", de uma versão de teste, não é mais usada e pode ser apagada.)
create table if not exists public.solicitacoes (
  id           uuid primary key default gen_random_uuid(),
  store        text not null default '',
  sector       text not null default '',
  person_name  text not null check (char_length(btrim(person_name)) > 0),
  access       text not null default '',
  notes        text not null default '',
  status       text not null default 'pendente' check (status in ('pendente', 'feito', 'cancelado')),
  ti_notes     text not null default '',
  requested_by text not null default '',
  done_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null
);

create index if not exists solicitacoes_status_idx on public.solicitacoes (status, created_at);

create or replace function public.solicitacoes_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists solicitacoes_touch on public.solicitacoes;
create trigger solicitacoes_touch
  before insert or update on public.solicitacoes
  for each row execute function public.solicitacoes_touch();

alter table public.solicitacoes enable row level security;

drop policy if exists "solicitacoes leem" on public.solicitacoes;
create policy "solicitacoes leem" on public.solicitacoes
  for select to authenticated
  using (
    public.is_admin()
    or (public.has_module('solicitacoes')
        and requested_by = lower(coalesce(auth.jwt() ->> 'email', '')))
  );

drop policy if exists "solicitacoes criam" on public.solicitacoes;
create policy "solicitacoes criam" on public.solicitacoes
  for insert to authenticated
  with check (
    public.has_module('solicitacoes')
    and requested_by = lower(coalesce(auth.jwt() ->> 'email', ''))
    and status = 'pendente'
  );

drop policy if exists "solicitacoes alteram" on public.solicitacoes;
create policy "solicitacoes alteram" on public.solicitacoes
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "solicitacoes excluem" on public.solicitacoes;
create policy "solicitacoes excluem" on public.solicitacoes
  for delete to authenticated using (public.is_admin());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'solicitacoes'
  ) then
    alter publication supabase_realtime add table public.solicitacoes;
  end if;
end;
$$;

-- ------------------------------------------- histórico de problemas dos equipamentos
-- Fica guardado mesmo depois que o problema é resolvido. Se o equipamento for
-- excluído, o histórico dele também é apagado.
create table if not exists public.ocorrencias (
  id           uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipamentos (id) on delete cascade,
  day          date not null,
  reason       text not null check (char_length(btrim(reason)) > 0),
  solution     text not null default '',
  resolved     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null
);

create index if not exists ocorrencias_equip_idx on public.ocorrencias (equipment_id, day desc);

create or replace function public.ocorrencias_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists ocorrencias_touch on public.ocorrencias;
create trigger ocorrencias_touch
  before insert or update on public.ocorrencias
  for each row execute function public.ocorrencias_touch();

alter table public.ocorrencias enable row level security;

drop policy if exists "ocorrencias leem" on public.ocorrencias;
create policy "ocorrencias leem" on public.ocorrencias
  for select to authenticated using (public.has_module('inventario'));

drop policy if exists "ocorrencias criam" on public.ocorrencias;
create policy "ocorrencias criam" on public.ocorrencias
  for insert to authenticated with check (public.has_module('inventario'));

drop policy if exists "ocorrencias alteram" on public.ocorrencias;
create policy "ocorrencias alteram" on public.ocorrencias
  for update to authenticated
  using (public.has_module('inventario')) with check (public.has_module('inventario'));

drop policy if exists "ocorrencias excluem" on public.ocorrencias;
create policy "ocorrencias excluem" on public.ocorrencias
  for delete to authenticated using (public.has_module('inventario'));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ocorrencias'
  ) then
    alter publication supabase_realtime add table public.ocorrencias;
  end if;
end;
$$;
