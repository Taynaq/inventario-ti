-- Ativos TI: ativa a aba "Acessos" (administradores). Rode UMA vez no Supabase > SQL Editor.
-- Troque o e-mail na última linha pelo e-mail de quem será administrador.

-- ---------------------------------------------------- administradores do app
-- Quem é administrador vê a aba "Acessos" no app e libera ou remove e-mails sem mexer no Supabase.
alter table public.allowed_emails add column if not exists is_admin boolean not null default false;
alter table public.allowed_emails add column if not exists added_at timestamptz not null default now();

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

-- Torna o seu e-mail administrador (troque pelo seu, em minúsculas):
insert into public.allowed_emails (email, is_admin) values ('seu@email.com', true)
  on conflict (email) do update set is_admin = true;
