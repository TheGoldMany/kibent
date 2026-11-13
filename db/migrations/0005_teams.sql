-- =============================================================================
-- Kibent – 0005: több csapat felhasználónként (tagságok), egyszerűsített belépés
-- Az alkalmazás az első induláskor AUTOMATIKUSAN lefuttatja (src/lib/auth/bootstrap.ts).
-- A tartalma megegyezik a src/lib/auth/teams-sql.ts fájléval. Újrafuttatható.
--
-- Modell: egy felhasználó több csapat (company) tagja lehet. Az aktív csapatot az
-- alkalmazás kérésenként az app.company_id beállítással adja meg; a meglévő RLS
-- szabályok (company_id = auth_company_id()) így az aktív csapatra szűkítenek.
-- =============================================================================

create table if not exists public.memberships (
  user_id    uuid not null references public.profiles (id) on delete cascade on update cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  role       text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (user_id, company_id)
);
create index if not exists memberships_company_idx on public.memberships (company_id);

-- Meglévő tagságok átvétele a régi profiles.company_id / role mezőkből
insert into public.memberships (user_id, company_id, role)
select id, company_id, role from public.profiles where company_id is not null
on conflict (user_id, company_id) do nothing;

alter table public.memberships enable row level security;
grant select on public.memberships to kibent_app;

-- -----------------------------------------------------------------------------
-- Aktív csapat és admin-jog: a tagság alapján
-- -----------------------------------------------------------------------------
create or replace function public.auth_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.company_id
    from public.memberships m
   where m.user_id = app.uid()
     and m.company_id = nullif(current_setting('app.company_id', true), '')::uuid;
$$;

create or replace function public.is_company_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
     where m.user_id = app.uid()
       and m.role = 'admin'
       and m.company_id = nullif(current_setting('app.company_id', true), '')::uuid
  );
$$;

drop policy if exists "memberships_select" on public.memberships;
create policy "memberships_select"
  on public.memberships for select to kibent_app
  using (user_id = app.uid() or company_id = public.auth_company_id());

-- Cégek: a felhasználó minden csapatát látja (a csapatváltóhoz)
drop policy if exists "companies_select_own" on public.companies;
create policy "companies_select_own"
  on public.companies for select to kibent_app
  using (exists (select 1 from public.memberships m where m.company_id = companies.id and m.user_id = app.uid()));

-- Profilok: saját + az aktív csapat tagjai
drop policy if exists "profiles_select_self_or_company" on public.profiles;
create policy "profiles_select_self_or_company"
  on public.profiles for select to kibent_app
  using (
    id = app.uid()
    or exists (select 1 from public.memberships m where m.user_id = profiles.id and m.company_id = public.auth_company_id())
  );

-- -----------------------------------------------------------------------------
-- Csapatonkénti egyediség (ugyanaz a felhasználó több csapatban is szerepelhet)
-- -----------------------------------------------------------------------------
alter table public.recurring_patterns drop constraint if exists recurring_patterns_user_id_key;
do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'recurring_patterns_user_company_key') then
    alter table public.recurring_patterns add constraint recurring_patterns_user_company_key unique (user_id, company_id);
  end if;
end
$do$;

alter table public.schedules drop constraint if exists schedules_user_date_key;
do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'schedules_user_company_date_key') then
    alter table public.schedules add constraint schedules_user_company_date_key unique (user_id, company_id, date);
  end if;
end
$do$;

do $do$
begin
  if to_regclass('public.work_hours') is not null
     and not exists (select 1 from pg_constraint where conname = 'work_hours_user_company_day_key') then
    alter table public.work_hours drop constraint if exists work_hours_pkey;
    alter table public.work_hours add constraint work_hours_user_company_day_key primary key (user_id, company_id, weekday);
  end if;
end
$do$;

-- -----------------------------------------------------------------------------
-- RPC-k a tagság-modellhez
-- -----------------------------------------------------------------------------

-- Új csapat: a létrehozó admin lesz. Bárki létrehozhat több csapatot is.
create or replace function public.create_company(company_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.uid();
  new_company_id uuid;
begin
  if uid is null then
    raise exception 'Bejelentkezés szükséges.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'A profilod még nem jött létre. Frissítsd az oldalt, és próbáld újra.' using errcode = 'P0002';
  end if;
  if company_name is null or char_length(trim(company_name)) = 0 then
    raise exception 'A csapat neve kötelező.' using errcode = '22023';
  end if;
  insert into public.companies (name, invite_code)
  values (trim(company_name), public.generate_invite_code())
  returning id into new_company_id;
  insert into public.memberships (user_id, company_id, role) values (uid, new_company_id, 'admin');
  return new_company_id;
end;
$$;

-- Meghívó elfogadása a levélben kapott linkkel (a link birtoklása a bizonyíték).
create or replace function public.accept_invitation(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.uid();
  inv public.company_invitations%rowtype;
begin
  if uid is null then
    raise exception 'Bejelentkezés szükséges.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'A profilod még nem jött létre. Frissítsd az oldalt, és próbáld újra.' using errcode = 'P0002';
  end if;

  select * into inv from public.company_invitations where token = p_token for update;
  if not found then
    raise exception 'Ez a meghívó érvénytelen.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.memberships where user_id = uid and company_id = inv.company_id) then
    update public.company_invitations
       set accepted_at = coalesce(accepted_at, now()), accepted_by = coalesce(accepted_by, uid)
     where id = inv.id;
    return inv.company_id;
  end if;
  if inv.accepted_at is not null then
    raise exception 'Ezt a meghívót már felhasználták. Kérj újat a csapat adminisztrátorától.' using errcode = 'P0002';
  end if;
  if inv.expires_at < now() then
    raise exception 'Ez a meghívó lejárt. Kérj újat a csapat adminisztrátorától.' using errcode = 'P0002';
  end if;

  insert into public.memberships (user_id, company_id, role) values (uid, inv.company_id, 'member')
  on conflict (user_id, company_id) do nothing;
  update public.company_invitations set accepted_at = now(), accepted_by = uid where id = inv.id;
  return inv.company_id;
end;
$$;

-- Szerepkör módosítása az aktív csapatban – az utolsó admin nem fokozható le.
create or replace function public.set_member_role(target_user uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.auth_company_id();
  target_role text;
begin
  if not public.is_company_admin() then
    raise exception 'Csak adminisztrátor módosíthat szerepkört.' using errcode = '42501';
  end if;
  if new_role not in ('admin', 'member') then
    raise exception 'Érvénytelen szerepkör.' using errcode = '22023';
  end if;
  select role into target_role from public.memberships where user_id = target_user and company_id = cid for update;
  if not found then
    raise exception 'A felhasználó nem tagja a csapatnak.' using errcode = '42501';
  end if;
  if target_role = 'admin' and new_role = 'member'
     and (select count(*) from public.memberships where company_id = cid and role = 'admin') <= 1 then
    raise exception 'A csapatnak legalább egy adminisztrátorral kell rendelkeznie.' using errcode = '23514';
  end if;
  update public.memberships set role = new_role where user_id = target_user and company_id = cid;
end;
$$;

-- Tag eltávolítása az aktív csapatból.
create or replace function public.remove_member(target_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.auth_company_id();
begin
  if not public.is_company_admin() then
    raise exception 'Csak adminisztrátor távolíthat el tagot.' using errcode = '42501';
  end if;
  if target_user = app.uid() then
    raise exception 'Saját magadat nem távolíthatod el.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.memberships where user_id = target_user and company_id = cid) then
    raise exception 'A felhasználó nem tagja a csapatnak.' using errcode = '42501';
  end if;
  delete from public.recurring_patterns where user_id = target_user and company_id = cid;
  delete from public.schedules where user_id = target_user and company_id = cid;
  if to_regclass('public.work_hours') is not null then
    execute 'delete from public.work_hours where user_id = $1 and company_id = $2' using target_user, cid;
  end if;
  delete from public.memberships where user_id = target_user and company_id = cid;
end;
$$;

-- Profil biztosítása az első belépéskor (a régi, email alapú átvétel megszűnt:
-- email-megerősítés nélkül az nem lenne biztonságos).
create or replace function public.ensure_profile(p_email text, p_full_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.uid();
begin
  if uid is null then
    raise exception 'Bejelentkezés szükséges.' using errcode = '42501';
  end if;
  insert into public.profiles (id, email, full_name)
  values (
    uid,
    coalesce(p_email, ''),
    coalesce(
      nullif(trim(left(p_full_name, 120)), ''),
      nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
      'Felhasználó'
    )
  )
  on conflict (id) do nothing;
end;
$$;

revoke all on function public.create_company(text) from public;
revoke all on function public.accept_invitation(uuid) from public;
revoke all on function public.set_member_role(uuid, text) from public;
revoke all on function public.remove_member(uuid) from public;
revoke all on function public.ensure_profile(text, text) from public;
grant execute on function public.create_company(text) to kibent_app;
grant execute on function public.accept_invitation(uuid) to kibent_app;
grant execute on function public.set_member_role(uuid, text) to kibent_app;
grant execute on function public.remove_member(uuid) to kibent_app;
grant execute on function public.ensure_profile(text, text) to kibent_app;
grant execute on function public.auth_company_id() to kibent_app;
grant execute on function public.is_company_admin() to kibent_app;

-- A régi, egy-csapatos csatlakozási RPC-k kivezetése (a tagságot már nem a profiles.company_id adja)
do $do$
begin
  if to_regprocedure('public.join_company(text)') is not null then
    revoke execute on function public.join_company(text) from kibent_app;
  end if;
  if to_regprocedure('public.accept_pending_invitation()') is not null then
    revoke execute on function public.accept_pending_invitation() from kibent_app;
  end if;
end
$do$;

-- Verziójelző a bootstraphez
comment on table public.memberships is 'kibent-teams-v1';
