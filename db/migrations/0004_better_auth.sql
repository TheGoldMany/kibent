-- =============================================================================
-- Kibent – 0004: saját Better Auth a Neon Auth helyett (újrafuttatható)
-- Az alkalmazás az első induláskor AUTOMATIKUSAN lefuttatja (src/lib/auth/bootstrap.ts),
-- kézzel nem kell. A tartalma megegyezik a src/lib/auth/schema-sql.ts fájléval.
-- =============================================================================

create schema if not exists better_auth;
-- Az alkalmazás korlátozott szerepköre (kibent_app) nem fér hozzá az auth adatokhoz.
revoke all on schema better_auth from public;

create table if not exists better_auth."user" (
  "id" uuid default gen_random_uuid() not null primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" boolean not null,
  "image" text,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz default current_timestamp not null
);

create table if not exists better_auth."session" (
  "id" uuid default gen_random_uuid() not null primary key,
  "expiresAt" timestamptz not null,
  "token" text not null unique,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" uuid not null references better_auth."user" ("id") on delete cascade
);

create table if not exists better_auth."account" (
  "id" uuid default gen_random_uuid() not null primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" uuid not null references better_auth."user" ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz not null
);

create table if not exists better_auth."verification" (
  "id" uuid default gen_random_uuid() not null primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz default current_timestamp not null
);

create table if not exists better_auth."rateLimit" (
  "id" uuid default gen_random_uuid() not null primary key,
  "key" text not null unique,
  "count" integer not null,
  "lastRequest" bigint not null
);

create index if not exists "session_userId_idx" on better_auth."session" ("userId");
create index if not exists "account_userId_idx" on better_auth."account" ("userId");
create index if not exists "verification_identifier_idx" on better_auth."verification" ("identifier");

-- A Neon Auth triggerek már nem kellenek (ha jogosultság hiányzik, kihagyjuk).
do $do$
begin
  drop trigger if exists on_auth_user_created on neon_auth."user";
  drop trigger if exists on_auth_user_email_changed on neon_auth."user";
exception when insufficient_privilege or undefined_table or invalid_schema_name then
  null;
end
$do$;

-- A profil mostantól a Better Auth felhasználóhoz tartozik. A régi (Neon Auth) profilok
-- érvényesítés nélkül maradnak, amíg a gazdájuk újra nem regisztrál (lásd ensure_profile).
alter table public.profiles drop constraint if exists profiles_id_fkey;
do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_id_better_auth_fkey') then
    alter table public.profiles
      add constraint profiles_id_better_auth_fkey
      foreign key (id) references better_auth."user" (id) on delete cascade not valid;
  end if;
end
$do$;

-- A profilra mutató összes hivatkozás frissítéskor továbbgyűrűzik (régi profil átvétele).
do $do$
declare
  r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, pg_get_constraintdef(c.oid) as def
      from pg_constraint c
     where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass and c.confupdtype <> 'c'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I %s on update cascade', r.tbl, r.conname, r.def);
  end loop;
end
$do$;

-- Profil biztosítása az első belépéskor. Ha ugyanezzel az email címmel van régi profil,
-- amelyhez nincs Better Auth fiók (a Neon Auth idejéből), azt veszi át – a céggel,
-- beosztással, szabadságokkal együtt. Csak megerősített email címmel lehet belépni.
create or replace function public.ensure_profile(p_email text, p_full_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.uid();
  legacy uuid;
begin
  if uid is null then
    raise exception 'Bejelentkezés szükséges.' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = uid) then
    return;
  end if;

  select p.id into legacy
    from public.profiles p
   where lower(p.email) = lower(coalesce(p_email, ''))
     and coalesce(p_email, '') <> ''
     and not exists (select 1 from better_auth."user" u where u.id = p.id)
   order by p.created_at
   limit 1
   for update;

  if legacy is not null then
    -- A továbbgyűrűző frissítés idejére nincs felhasználói kontextus (a schedules_guard
    -- különben „más sorának módosításaként” tiltaná), utána visszaállítjuk.
    perform set_config('app.user_id', '', true);
    update public.profiles set id = uid where id = legacy;
    perform set_config('app.user_id', uid::text, true);
    return;
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
grant execute on function public.ensure_profile(text, text) to kibent_app;

-- Verziójelző: a bootstrap ebből tudja, hogy már lefutott.
comment on schema better_auth is 'kibent-auth-v1';
