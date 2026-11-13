-- =============================================================================
-- Kibent – 0003: biztonsági megerősítések (újrafuttatható)
--  * Admin csak SZABADSÁGKÉRELMET bírálhat el (más státuszú sort nem utasíthat el)
--  * Emailes kódküldés korlátozása (visszaélés / levélbombázás ellen)
-- Az alkalmazás e migráció nélkül is működik; lefuttatása után lépnek életbe.
-- =============================================================================

-- 1. schedules_guard: az admin ág csak vacation sorra érvényes
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
  if uid is null then
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'UPDATE' and old.user_id <> uid then
    if not caller_is_admin then
      raise exception 'Csak adminisztrátor bírálhat el más kérelmet.' using errcode = '42501';
    end if;
    if old.status <> 'vacation' then
      raise exception 'Csak szabadságkérelem bírálható el.' using errcode = '42501';
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
    if new.approval_status <> 'approved' then
      raise exception 'Ehhez a státuszhoz nem tartozik jóváhagyás.' using errcode = '22023';
    end if;
  end if;

  if new.approval_status = 'pending' then
    new.reviewed_by := null;
  elsif new.status = 'vacation' then
    new.reviewed_by := uid;
  else
    new.reviewed_by := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- 2. Kódküldés-korlátozás: kulcsonként (email / IP) számláló egy időablakban.
-- Csak a szerver (tulajdonosi kapcsolat) éri el; a kibent_app nem.
create table if not exists public.rate_limits (
  key          text primary key,
  count        integer not null default 0,
  window_start timestamptz not null default now()
);
revoke all on public.rate_limits from public;
alter table public.rate_limits enable row level security;

-- Atomikus számlálás: igaz, ha a kérés belefér a keretbe.
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  c integer;
begin
  insert into public.rate_limits as r (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into c;
  -- régi bejegyzések alkalmi takarítása
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return c <= p_limit;
end;
$$;
revoke all on function public.rate_limit_hit(text, integer, integer) from public;
