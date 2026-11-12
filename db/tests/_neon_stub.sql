-- Minimális Neon Auth stub a migráció helyi teszteléséhez (NEM éles használatra).
-- Élesben a neon_auth sémát a Neon Auth hozza létre és kezeli.
create schema if not exists neon_auth;
create table if not exists neon_auth."user" (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  email text not null,
  "emailVerified" boolean not null default false,
  image text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
