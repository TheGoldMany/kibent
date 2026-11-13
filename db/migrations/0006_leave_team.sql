-- =============================================================================
-- Kibent – 0006: kilépés a csapatból
-- Az alkalmazás az első induláskor AUTOMATIKUSAN lefuttatja (src/lib/auth/bootstrap.ts).
-- A tartalma megegyezik a src/lib/auth/leave-sql.ts fájléval. Újrafuttatható.
-- =============================================================================

-- Kilépés az aktív csapatból. Az utolsó tag kilépésével a csapat megszűnik.
-- Visszatérés: true, ha a csapat is törlődött.
create or replace function public.leave_team()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := app.uid();
  cid uuid := public.auth_company_id();
  my_role text;
  others integer;
begin
  if uid is null or cid is null then
    raise exception 'Nem vagy tagja ennek a csapatnak.' using errcode = '42501';
  end if;
  -- A csapat zárolása: két egyidejű kilépés ne hagyjon admin nélküli csapatot
  perform 1 from public.companies where id = cid for update;
  select role into my_role from public.memberships where user_id = uid and company_id = cid;
  select count(*) into others from public.memberships where company_id = cid and user_id <> uid;

  if others = 0 then
    delete from public.companies where id = cid; -- minden adata vele törlődik
    return true;
  end if;
  if my_role = 'admin'
     and not exists (select 1 from public.memberships where company_id = cid and user_id <> uid and role = 'admin') then
    raise exception 'Te vagy az egyetlen adminisztrátor. Előbb tegyél adminná valaki mást a Tagok listában.' using errcode = '23514';
  end if;

  delete from public.recurring_patterns where user_id = uid and company_id = cid;
  delete from public.schedules where user_id = uid and company_id = cid;
  if to_regclass('public.work_hours') is not null then
    execute 'delete from public.work_hours where user_id = $1 and company_id = $2' using uid, cid;
  end if;
  delete from public.memberships where user_id = uid and company_id = cid;
  return false;
end;
$$;

revoke all on function public.leave_team() from public;
grant execute on function public.leave_team() to kibent_app;

-- Verziójelző a bootstraphez
comment on function public.leave_team() is 'kibent-leave-v1';
