-- =============================================================================
-- Kibent – 0002: munkaidő, ebédszünet, email alapú meghívók
-- Újrafuttatható (idempotens): félbeszakadt futtatás után egyszerűen futtasd újra.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ebédszünet hossza (cégszintű, az admin állítja be)
-- -----------------------------------------------------------------------------
alter table public.companies
  add column if not exists lunch_minutes integer not null default 30;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_lunch_minutes_check') then
    alter table public.companies
      add constraint companies_lunch_minutes_check check (lunch_minutes between 0 and 180);
  end if;
end
$$;

grant update (name, lunch_minutes) on public.companies to kibent_app;

-- -----------------------------------------------------------------------------
-- 2. Munkaidő (felhasználónként, hétköznaponként)
-- -----------------------------------------------------------------------------
create table if not exists public.work_hours (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  company_id  uuid not null references public.companies (id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 5), -- 1 = hétfő … 5 = péntek
  start_time  time not null,
  end_time    time not null,
  lunch_start time,
  updated_at  timestamptz not null default now(),
  primary key (user_id, weekday),
  constraint work_hours_range_check check (start_time < end_time),
  constraint work_hours_lunch_check check (
    lunch_start is null or (lunch_start >= start_time and lunch_start < end_time)
  )
);

create index if not exists work_hours_company_idx on public.work_hours (company_id);

drop trigger if exists work_hours_touch on public.work_hours;
create trigger work_hours_touch
  before update on public.work_hours
  for each row execute function public.touch_updated_at();

alter table public.work_hours enable row level security;
grant select, insert, update, delete on public.work_hours to kibent_app;

drop policy if exists "work_hours_select_company" on public.work_hours;
create policy "work_hours_select_company"
  on public.work_hours for select to kibent_app
  using (company_id = public.auth_company_id());

drop policy if exists "work_hours_insert_own" on public.work_hours;
create policy "work_hours_insert_own"
  on public.work_hours for insert to kibent_app
  with check (user_id = app.uid() and company_id = public.auth_company_id());

drop policy if exists "work_hours_update_own" on public.work_hours;
create policy "work_hours_update_own"
  on public.work_hours for update to kibent_app
  using (user_id = app.uid() and company_id = public.auth_company_id())
  with check (user_id = app.uid() and company_id = public.auth_company_id());

drop policy if exists "work_hours_delete_own" on public.work_hours;
create policy "work_hours_delete_own"
  on public.work_hours for delete to kibent_app
  using (user_id = app.uid() and company_id = public.auth_company_id());

-- -----------------------------------------------------------------------------
-- 3. Email alapú meghívók
-- -----------------------------------------------------------------------------
create table if not exists public.company_invitations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  email       text not null check (email = lower(trim(email)) and position('@' in email) > 1),
  token       uuid not null unique default gen_random_uuid(),
  invited_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null
);

-- Cégenként egy címre egyszerre csak egy nyitott meghívó lehet.
create unique index if not exists company_invitations_open_idx
  on public.company_invitations (company_id, email)
  where accepted_at is null;
create index if not exists company_invitations_email_idx
  on public.company_invitations (email)
  where accepted_at is null;

alter table public.company_invitations enable row level security;
grant select, insert, delete on public.company_invitations to kibent_app;
grant update (expires_at, token) on public.company_invitations to kibent_app;

drop policy if exists "invitations_select_admin" on public.company_invitations;
create policy "invitations_select_admin"
  on public.company_invitations for select to kibent_app
  using (company_id = public.auth_company_id() and public.is_company_admin());

drop policy if exists "invitations_insert_admin" on public.company_invitations;
create policy "invitations_insert_admin"
  on public.company_invitations for insert to kibent_app
  with check (
    company_id = public.auth_company_id()
    and public.is_company_admin()
    and invited_by = app.uid()
    and accepted_at is null
    and accepted_by is null
  );

-- Újraküldés: lejárat meghosszabbítása / új token (csak nyitott meghívónál)
drop policy if exists "invitations_update_admin" on public.company_invitations;
create policy "invitations_update_admin"
  on public.company_invitations for update to kibent_app
  using (company_id = public.auth_company_id() and public.is_company_admin() and accepted_at is null)
  with check (company_id = public.auth_company_id() and public.is_company_admin() and accepted_at is null);

drop policy if exists "invitations_delete_admin" on public.company_invitations;
create policy "invitations_delete_admin"
  on public.company_invitations for delete to kibent_app
  using (company_id = public.auth_company_id() and public.is_company_admin() and accepted_at is null);

-- 3.1 Meghívó elfogadása tokennel: a belépett felhasználó emailjének egyeznie kell.
create or replace function public.accept_invitation(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.uid();
  my_email text;
  my_company uuid;
  inv public.company_invitations%rowtype;
begin
  if uid is null then
    raise exception 'Bejelentkezés szükséges.' using errcode = '42501';
  end if;

  select lower(email), company_id into my_email, my_company from public.profiles where id = uid;
  if not found then
    raise exception 'A profilod még nem jött létre. Frissítsd az oldalt, és próbáld újra.' using errcode = 'P0002';
  end if;

  select * into inv from public.company_invitations where token = p_token for update;
  if not found or inv.accepted_at is not null and inv.accepted_by is distinct from uid then
    raise exception 'Ez a meghívó érvénytelen vagy már felhasználták.' using errcode = 'P0002';
  end if;
  if inv.accepted_at is null and inv.expires_at < now() then
    raise exception 'Ez a meghívó lejárt. Kérj újat a céged adminisztrátorától.' using errcode = 'P0002';
  end if;
  if inv.email <> my_email then
    raise exception 'Ez a meghívó a(z) % címre szól. Lépj be azzal az email címmel.', inv.email using errcode = '42501';
  end if;

  if my_company = inv.company_id then
    update public.company_invitations
       set accepted_at = coalesce(accepted_at, now()), accepted_by = uid
     where id = inv.id;
    return inv.company_id;
  end if;
  if my_company is not null then
    raise exception 'Már egy másik cég tagja vagy. Egy fiók egyszerre csak egy céghez tartozhat.' using errcode = '23505';
  end if;

  update public.profiles set company_id = inv.company_id, role = 'member' where id = uid;
  update public.company_invitations set accepted_at = now(), accepted_by = uid where id = inv.id;
  return inv.company_id;
end;
$$;

-- 3.2 Automatikus csatlakozás belépéskor: ha a (megerősített) email címre szól
-- nyitott meghívó, és a felhasználó még nincs cégben. Az alkalmazás csak
-- megerősített email címnél hívja.
create or replace function public.accept_pending_invitation()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.uid();
  my_email text;
  my_company uuid;
  inv public.company_invitations%rowtype;
begin
  if uid is null then
    return null;
  end if;
  select lower(email), company_id into my_email, my_company from public.profiles where id = uid;
  if not found or my_company is not null or my_email = '' then
    return null;
  end if;

  select * into inv
    from public.company_invitations
   where email = my_email and accepted_at is null and expires_at >= now()
   order by created_at desc
   limit 1
   for update;
  if not found then
    return null;
  end if;

  update public.profiles set company_id = inv.company_id, role = 'member' where id = uid;
  update public.company_invitations set accepted_at = now(), accepted_by = uid where id = inv.id;
  return inv.company_id;
end;
$$;

revoke all on function public.accept_invitation(uuid) from public;
revoke all on function public.accept_pending_invitation() from public;
grant execute on function public.accept_invitation(uuid) to kibent_app;
grant execute on function public.accept_pending_invitation() to kibent_app;

-- 3.3 Tag eltávolításakor a munkaideje is törlődik
create or replace function public.remove_member(target_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.auth_company_id();
  target_company uuid;
begin
  if not public.is_company_admin() then
    raise exception 'Csak adminisztrátor távolíthat el tagot.' using errcode = '42501';
  end if;
  if target_user = app.uid() then
    raise exception 'Saját magadat nem távolíthatod el.' using errcode = '22023';
  end if;

  select company_id into target_company from public.profiles where id = target_user;
  if target_company is distinct from cid then
    raise exception 'A felhasználó nem tagja a cégnek.' using errcode = '42501';
  end if;

  delete from public.recurring_patterns where user_id = target_user and company_id = cid;
  delete from public.schedules where user_id = target_user and company_id = cid;
  delete from public.work_hours where user_id = target_user and company_id = cid;
  update public.profiles set company_id = null, role = 'member' where id = target_user;
end;
$$;
