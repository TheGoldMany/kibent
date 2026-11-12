-- =============================================================================
-- Kibent – kezdeti séma (Neon Postgres + Neon Auth)
-- Táblák, segédfüggvények, triggerek, Row Level Security
--
-- Jogosultsági modell:
--  * A felhasználókat a Neon Auth kezeli a neon_auth."user" táblában.
--  * Az alkalmazás minden felhasználói kérést egy tranzakcióban futtat:
--      SET LOCAL ROLE kibent_app;
--      SELECT set_config('app.user_id', '<uuid>', true);
--    így minden lekérdezésre érvényesek az RLS szabályok (app.uid()).
--  * A tábla-tulajdonos (neondb_owner) megkerüli az RLS-t – ezt kizárólag
--    az iCal feed és a migrációk használják.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Alkalmazás szerepkör és app.uid()
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'kibent_app') then
    create role kibent_app nologin;
  end if;
  -- A kapcsolódó (tulajdonos) szerepkör átválthasson kibent_app-ra.
  execute format('grant kibent_app to %I', current_user);
end
$$;

create schema if not exists app;
grant usage on schema app to kibent_app;
grant usage on schema public to kibent_app;

create or replace function app.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$;
grant execute on function app.uid() to kibent_app;

-- -----------------------------------------------------------------------------
-- 0. Segéd: meghívókód generálás (8 karakter, kriptográfiailag véletlen)
-- -----------------------------------------------------------------------------
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- 32 karakter (I, O, 0, 1 nélkül) -> egyenletes eloszlás byte % 32 mellett
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := uuid_send(gen_random_uuid());
  -- a v4 UUID verzió/variáns bitjeit (6. és 8. byte) kihagyjuk
  idx int[] := array[0, 1, 2, 3, 4, 5, 10, 11];
  result text := '';
  i int;
begin
  foreach i in array idx loop
    result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Táblák
-- -----------------------------------------------------------------------------
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 1 and 120),
  invite_code text not null unique default public.generate_invite_code(),
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references neon_auth."user" (id) on delete cascade,
  company_id  uuid references public.companies (id) on delete set null,
  email       text not null,
  full_name   text not null check (char_length(trim(full_name)) between 1 and 120),
  avatar_url  text,
  role        text not null default 'member' check (role in ('admin', 'member')),
  ical_token  uuid not null unique default gen_random_uuid(),
  created_at  timestamptz not null default now()
);

create index profiles_company_id_idx on public.profiles (company_id);

create table public.recurring_patterns (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references public.profiles (id) on delete cascade,
  company_id  uuid not null references public.companies (id) on delete cascade,
  mon         text check (mon in ('office', 'remote')),
  tue         text check (tue in ('office', 'remote')),
  wed         text check (wed in ('office', 'remote')),
  thu         text check (thu in ('office', 'remote')),
  fri         text check (fri in ('office', 'remote')),
  updated_at  timestamptz not null default now()
);

create index recurring_patterns_company_id_idx on public.recurring_patterns (company_id);

create table public.schedules (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  date             date not null,
  status           text not null check (status in ('office', 'remote', 'vacation', 'sick')),
  approval_status  text not null default 'approved'
                   check (approval_status in ('approved', 'pending', 'rejected')),
  request_group_id uuid,
  note             text check (note is null or char_length(note) <= 500),
  reviewed_by      uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint schedules_user_date_key unique (user_id, date)
);

create index schedules_company_date_idx on public.schedules (company_id, date);
create index schedules_request_group_idx on public.schedules (request_group_id)
  where request_group_id is not null;
create index schedules_pending_idx on public.schedules (company_id)
  where approval_status = 'pending';

create table public.medical_documents (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  request_group_id uuid not null,
  storage_path     text not null unique,
  file_name        text not null,
  mime_type        text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  uploaded_at      timestamptz not null default now()
);

create index medical_documents_group_idx on public.medical_documents (request_group_id);
create index medical_documents_company_user_idx on public.medical_documents (company_id, user_id);

-- -----------------------------------------------------------------------------
-- 2. SECURITY DEFINER segédfüggvények (RLS rekurzió elkerülésére)
-- -----------------------------------------------------------------------------
create or replace function public.auth_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.company_id from public.profiles p where p.id = app.uid();
$$;

create or replace function public.is_company_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = app.uid()
      and p.role = 'admin'
      and p.company_id is not null
  );
$$;

-- -----------------------------------------------------------------------------
-- 3. Triggerek
-- -----------------------------------------------------------------------------

-- 3.1 Új Neon Auth felhasználó -> profil
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(trim(new.name), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Felhasználó'
    ),
    new.image
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- A neon_auth sémát a Neon Auth kezeli; ha a tulajdonos szerepkör nem hozhat
-- létre rajta triggert, a migráció figyelmeztetéssel továbbmegy – a profilt
-- ilyenkor az alkalmazás hozza létre az első belépéskor (public.ensure_profile).
do $do$
begin
  drop trigger if exists on_auth_user_created on neon_auth."user";
  create trigger on_auth_user_created
    after insert on neon_auth."user"
    for each row execute function public.handle_new_user();
exception when insufficient_privilege or undefined_table then
  raise warning 'on_auth_user_created trigger kihagyva (%): a profil az első belépéskor jön létre.', sqlerrm;
end
$do$;

-- 3.2 Email szinkron, ha a felhasználó emailje változik
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end;
$$;

do $do$
begin
  drop trigger if exists on_auth_user_email_changed on neon_auth."user";
  create trigger on_auth_user_email_changed
    after update of email on neon_auth."user"
    for each row execute function public.handle_user_email_change();
exception when insufficient_privilege or undefined_table then
  raise warning 'on_auth_user_email_changed trigger kihagyva (%).', sqlerrm;
end
$do$;

-- Már létező Neon Auth felhasználók profiljai (ha a migráció később fut)
do $do$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  select u.id, coalesce(u.email, ''),
         coalesce(nullif(trim(u.name), ''), nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'Felhasználó'),
         u.image
    from neon_auth."user" u
  on conflict (id) do nothing;
exception when insufficient_privilege then
  raise warning 'Meglévő felhasználók átvétele kihagyva (%).', sqlerrm;
end
$do$;

-- 3.2b Profil biztosítása az első belépéskor (trigger nélküli környezetben is).
-- Csak a hívó saját (app.uid()) profilját hozhatja létre; a szerepkör és a cég
-- mindig az alapértelmezett (member, cég nélkül).
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

-- 3.3 schedules védelem: mezők immutabilitása, jóváhagyási szabályok
create or replace function public.schedules_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.uid();
  caller_is_admin boolean := public.is_company_admin();
begin
  -- Service role / belső hívás: nincs felhasználói kontextus
  if uid is null then
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'UPDATE' and old.user_id <> uid then
    -- Más sorát csak admin módosíthatja (RLS is ellenőrzi), és csak az elbírálást.
    if not caller_is_admin then
      raise exception 'Csak adminisztrátor bírálhat el más kérelmet.' using errcode = '42501';
    end if;
    if new.user_id <> old.user_id
       or new.company_id <> old.company_id
       or new.date <> old.date
       or new.status <> old.status
       or new.request_group_id is distinct from old.request_group_id
       or new.note is distinct from old.note then
      raise exception 'Adminisztrátor csak a jóváhagyási státuszt módosíthatja.' using errcode = '42501';
    end if;
    new.reviewed_by := uid;
    new.updated_at := now();
    return new;
  end if;

  -- Saját sor beszúrása / módosítása
  if new.user_id <> uid then
    raise exception 'Csak a saját beosztásodat módosíthatod.' using errcode = '42501';
  end if;

  if new.status = 'vacation' then
    if not caller_is_admin and new.approval_status <> 'pending' then
      raise exception 'A szabadságkérelemnek jóváhagyásra kell várnia.' using errcode = '42501';
    end if;
    if caller_is_admin and new.approval_status = 'rejected' and tg_op = 'INSERT' then
      raise exception 'Érvénytelen jóváhagyási státusz.' using errcode = '22023';
    end if;
  else
    -- iroda / home office / betegszabadság nem igényel jóváhagyást
    if new.approval_status <> 'approved' then
      raise exception 'Ehhez a státuszhoz nem tartozik jóváhagyás.' using errcode = '22023';
    end if;
  end if;

  if new.approval_status = 'pending' then
    new.reviewed_by := null;
  elsif new.status = 'vacation' then
    new.reviewed_by := uid; -- admin saját szabadsága
  else
    new.reviewed_by := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger schedules_guard_trg
  before insert or update on public.schedules
  for each row execute function public.schedules_guard();

-- 3.4 recurring_patterns updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger recurring_patterns_touch
  before update on public.recurring_patterns
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 4. RPC függvények (onboarding, meghívás, szerepkörök)
-- -----------------------------------------------------------------------------

-- 4.1 Cég létrehozása – a hívó lesz az admin
create or replace function public.create_company(company_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.uid();
  new_company_id uuid;
  attempts int := 0;
begin
  if uid is null then
    raise exception 'Bejelentkezés szükséges.' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = uid and company_id is not null) then
    raise exception 'Már tagja vagy egy cégnek.' using errcode = '23505';
  end if;
  if company_name is null or char_length(trim(company_name)) = 0 then
    raise exception 'A cég neve kötelező.' using errcode = '22023';
  end if;

  loop
    begin
      insert into public.companies (name, invite_code)
      values (trim(company_name), public.generate_invite_code())
      returning id into new_company_id;
      exit;
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts > 5 then raise; end if;
    end;
  end loop;

  update public.profiles
     set company_id = new_company_id, role = 'admin'
   where id = uid;
  if not found then
    raise exception 'A profilod még nem jött létre. Frissítsd az oldalt, és próbáld újra.' using errcode = 'P0002';
  end if;

  return new_company_id;
end;
$$;

-- 4.2 Csatlakozás meghívókóddal – member szerepkörrel
create or replace function public.join_company(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.uid();
  target_company uuid;
  current_company uuid;
begin
  if uid is null then
    raise exception 'Bejelentkezés szükséges.' using errcode = '42501';
  end if;

  select id into target_company
    from public.companies
   where invite_code = upper(trim(code));

  if target_company is null then
    raise exception 'Érvénytelen vagy lejárt meghívókód.' using errcode = 'P0002';
  end if;

  select company_id into current_company from public.profiles where id = uid;

  if current_company = target_company then
    return target_company; -- idempotens
  end if;
  if current_company is not null then
    raise exception 'Már tagja vagy egy másik cégnek.' using errcode = '23505';
  end if;

  update public.profiles
     set company_id = target_company, role = 'member'
   where id = uid;
  if not found then
    raise exception 'A profilod még nem jött létre. Frissítsd az oldalt, és próbáld újra.' using errcode = 'P0002';
  end if;

  return target_company;
end;
$$;

-- 4.3 Meghívó előnézet (cégnév) – bejelentkezett, cég nélküli felhasználónak is
create or replace function public.preview_invite(code text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.name from public.companies c where c.invite_code = upper(trim(code));
$$;

-- 4.4 Meghívókód újragenerálása (admin)
create or replace function public.regenerate_invite_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.auth_company_id();
  new_code text;
  attempts int := 0;
begin
  if not public.is_company_admin() then
    raise exception 'Csak adminisztrátor generálhat új meghívókódot.' using errcode = '42501';
  end if;
  loop
    begin
      new_code := public.generate_invite_code();
      update public.companies set invite_code = new_code where id = cid;
      exit;
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts > 5 then raise; end if;
    end;
  end loop;
  return new_code;
end;
$$;

-- 4.5 Saját iCal token újragenerálása (régi link érvénytelenítése)
create or replace function public.regenerate_ical_token()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.uid();
  new_token uuid := gen_random_uuid();
begin
  if uid is null then
    raise exception 'Bejelentkezés szükséges.' using errcode = '42501';
  end if;
  update public.profiles set ical_token = new_token where id = uid;
  return new_token;
end;
$$;

-- 4.6 Szerepkör módosítása (admin) – az utolsó admin nem fokozható le
create or replace function public.set_member_role(target_user uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := public.auth_company_id();
  target_company uuid;
  target_role text;
begin
  if not public.is_company_admin() then
    raise exception 'Csak adminisztrátor módosíthat szerepkört.' using errcode = '42501';
  end if;
  if new_role not in ('admin', 'member') then
    raise exception 'Érvénytelen szerepkör.' using errcode = '22023';
  end if;

  select company_id, role into target_company, target_role
    from public.profiles where id = target_user
    for update;

  if target_company is distinct from cid then
    raise exception 'A felhasználó nem tagja a cégnek.' using errcode = '42501';
  end if;

  if target_role = 'admin' and new_role = 'member' and (
    select count(*) from public.profiles where company_id = cid and role = 'admin'
  ) <= 1 then
    raise exception 'A cégnek legalább egy adminisztrátorral kell rendelkeznie.' using errcode = '23514';
  end if;

  update public.profiles set role = new_role where id = target_user;
end;
$$;

-- 4.7 Tag eltávolítása a cégből (admin)
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
  -- Az orvosi igazolások metaadatai megmaradnak (a cég adminjai továbbra is látják).
  update public.profiles set company_id = null, role = 'member' where id = target_user;
end;
$$;

-- RPC jogosultságok
revoke all on all functions in schema public from public;
grant execute on function public.ensure_profile(text, text) to kibent_app;
grant execute on function public.create_company(text) to kibent_app;
grant execute on function public.join_company(text) to kibent_app;
grant execute on function public.preview_invite(text) to kibent_app;
grant execute on function public.regenerate_invite_code() to kibent_app;
grant execute on function public.regenerate_ical_token() to kibent_app;
grant execute on function public.set_member_role(uuid, text) to kibent_app;
grant execute on function public.remove_member(uuid) to kibent_app;
grant execute on function public.auth_company_id() to kibent_app;
grant execute on function public.is_company_admin() to kibent_app;
-- trigger függvények: a triggerhez nem kell EXECUTE jog a hívónak, de a
-- schedules_guard / touch_updated_at a kibent_app nevében fut
grant execute on function public.schedules_guard() to kibent_app;
grant execute on function public.touch_updated_at() to kibent_app;

-- -----------------------------------------------------------------------------
-- 5. Tábla- és oszlopszintű jogosultságok (érzékeny mezők védelme)
-- -----------------------------------------------------------------------------
grant select on public.companies to kibent_app;
grant update (name) on public.companies to kibent_app;

grant select on public.profiles to kibent_app;
grant update (full_name, avatar_url) on public.profiles to kibent_app;

grant select, insert, update, delete on public.recurring_patterns to kibent_app;
grant select, insert, update, delete on public.schedules to kibent_app;
grant select, insert, delete on public.medical_documents to kibent_app;

-- -----------------------------------------------------------------------------
-- 6. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.companies          enable row level security;
alter table public.profiles           enable row level security;
alter table public.recurring_patterns enable row level security;
alter table public.schedules          enable row level security;
alter table public.medical_documents  enable row level security;

-- 6.1 companies
create policy "companies_select_own"
  on public.companies for select to kibent_app
  using (id = public.auth_company_id());

create policy "companies_update_admin"
  on public.companies for update to kibent_app
  using (id = public.auth_company_id() and public.is_company_admin())
  with check (id = public.auth_company_id() and public.is_company_admin());

-- 6.2 profiles
create policy "profiles_select_self_or_company"
  on public.profiles for select to kibent_app
  using (id = app.uid() or (company_id is not null and company_id = public.auth_company_id()));

create policy "profiles_update_self"
  on public.profiles for update to kibent_app
  using (id = app.uid())
  with check (id = app.uid());

-- 6.3 recurring_patterns
create policy "patterns_select_company"
  on public.recurring_patterns for select to kibent_app
  using (company_id = public.auth_company_id());

create policy "patterns_insert_own"
  on public.recurring_patterns for insert to kibent_app
  with check (user_id = app.uid() and company_id = public.auth_company_id());

create policy "patterns_update_own"
  on public.recurring_patterns for update to kibent_app
  using (user_id = app.uid() and company_id = public.auth_company_id())
  with check (user_id = app.uid() and company_id = public.auth_company_id());

create policy "patterns_delete_own"
  on public.recurring_patterns for delete to kibent_app
  using (user_id = app.uid() and company_id = public.auth_company_id());

-- 6.4 schedules
create policy "schedules_select_company"
  on public.schedules for select to kibent_app
  using (company_id = public.auth_company_id());

create policy "schedules_insert_own"
  on public.schedules for insert to kibent_app
  with check (
    user_id = app.uid()
    and company_id = public.auth_company_id()
    and (
      (status = 'vacation' and (approval_status = 'pending' or public.is_company_admin()))
      or (status <> 'vacation' and approval_status = 'approved')
    )
  );

create policy "schedules_update_own"
  on public.schedules for update to kibent_app
  using (user_id = app.uid() and company_id = public.auth_company_id())
  with check (
    user_id = app.uid()
    and company_id = public.auth_company_id()
    and (
      (status = 'vacation' and (approval_status = 'pending' or public.is_company_admin()))
      or (status <> 'vacation' and approval_status = 'approved')
    )
  );

-- Admin: mások kérelmeinek elbírálása (a trigger csak az approval_status változását engedi)
create policy "schedules_review_admin"
  on public.schedules for update to kibent_app
  using (company_id = public.auth_company_id() and public.is_company_admin() and user_id <> app.uid())
  with check (
    company_id = public.auth_company_id()
    and public.is_company_admin()
    and approval_status in ('approved', 'rejected', 'pending')
  );

create policy "schedules_delete_own"
  on public.schedules for delete to kibent_app
  using (user_id = app.uid() and company_id = public.auth_company_id());

-- 6.5 medical_documents – csak a feltöltő és a cég adminjai
create policy "medical_docs_select_owner_or_admin"
  on public.medical_documents for select to kibent_app
  using (
    company_id = public.auth_company_id()
    and (user_id = app.uid() or public.is_company_admin())
  );

create policy "medical_docs_insert_owner_or_admin"
  on public.medical_documents for insert to kibent_app
  with check (
    company_id = public.auth_company_id()
    and (user_id = app.uid() or public.is_company_admin())
    and exists (
      select 1 from public.schedules s
      where s.request_group_id = medical_documents.request_group_id
        and s.user_id = medical_documents.user_id
        and s.company_id = medical_documents.company_id
        and s.status = 'sick'
    )
  );

create policy "medical_docs_delete_owner_or_admin"
  on public.medical_documents for delete to kibent_app
  using (
    company_id = public.auth_company_id()
    and (user_id = app.uid() or public.is_company_admin())
  );

-- -----------------------------------------------------------------------------
-- 7. Fájlok
-- Az orvosi igazolások a Vercel Blob privát tárolójában vannak:
--   {company_id}/{user_id}/{request_group_id}/{uuid}-{fájlnév}
-- A fájlhoz csak az kap 60 mp-es aláírt URL-t, aki a medical_documents sort
-- az RLS szerint láthatja (feltöltő vagy a cég adminja).
-- -----------------------------------------------------------------------------
