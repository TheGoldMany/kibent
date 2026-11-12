-- Kibent RLS / üzleti szabály tesztek (helyi Postgres + _supabase_stub.sql)
-- Futtatás: supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.expect_fail(stmt text, label text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'OK (elutasítva): % -> %', label, sqlerrm;
    return;
  end;
  raise exception 'HIBA: várt elutasítás elmaradt: %', label;
end $$;

create or replace function pg_temp.expect_eq(actual bigint, expected bigint, label text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'HIBA: % – várt: %, kapott: %', label, expected, actual;
  end if;
  raise notice 'OK: %', label;
end $$;

grant execute on all functions in schema pg_temp to authenticated;

-- Felhasználók
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'anna@acme.hu', '{"full_name":"Kovács Anna"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bela@acme.hu', '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'cili@other.hu', '{"full_name":"Szabó Cili"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dani@acme.hu', '{"full_name":"Tóth Dani"}');

select pg_temp.expect_eq((select count(*) from public.profiles), 4, 'trigger létrehozta a profilokat');
select pg_temp.expect_eq(
  (select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000b' and full_name = 'bela'),
  1, 'full_name fallback email előtagra');

-- ---------------------------------------------------------------- Onboarding
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.create_company('Acme Kft.');
select pg_temp.expect_eq((select count(*) from public.profiles where id = auth.uid() and role = 'admin'), 1, 'cég létrehozója admin');
select pg_temp.expect_eq((select count(*) from public.companies where char_length(invite_code) = 8), 1, '8 karakteres meghívókód');
select pg_temp.expect_fail($$select public.create_company('Második')$$, 'második cég létrehozása tiltott');

reset role;
create temp table t_ctx as select id as acme_id, invite_code from public.companies;
grant select on t_ctx to authenticated;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_fail($$select public.join_company('ROSSZKOD')$$, 'érvénytelen meghívókód');
select public.join_company((select lower(invite_code) from t_ctx));
select pg_temp.expect_eq((select count(*) from public.profiles where id = auth.uid() and role = 'member' and company_id is not null), 1, 'meghívóval member lett (kis/nagybetű független)');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select public.join_company((select invite_code from t_ctx));

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_eq((select count(*) from public.profiles), 1, 'cég nélküli user csak magát látja');
select public.create_company('Other Zrt.');
select pg_temp.expect_fail($$select public.join_company((select invite_code from t_ctx))$$, 'másik cég tagja nem csatlakozhat');

-- ---------------------------------------------------------------- Profil védelem
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_fail($$update public.profiles set role = 'admin' where id = auth.uid()$$, 'member nem léptetheti elő magát');
select pg_temp.expect_fail($$update public.profiles set company_id = null where id = auth.uid()$$, 'company_id nem írható közvetlenül');
update public.profiles set full_name = 'Nagy Béla' where id = auth.uid();
select pg_temp.expect_eq((select count(*) from public.profiles where full_name = 'Nagy Béla'), 1, 'saját név módosítható');
select pg_temp.expect_fail($$select public.regenerate_invite_code()$$, 'member nem generálhat meghívókódot');
update public.companies set name = 'Hack';
select pg_temp.expect_eq((select count(*) from public.companies where name = 'Hack'), 0, 'member cégátnevezése hatástalan');

-- ---------------------------------------------------------------- Schedules
insert into public.schedules (company_id, user_id, date, status)
  values ((select acme_id from t_ctx), auth.uid(), '2026-11-16', 'office');
select pg_temp.expect_fail(
  $$insert into public.schedules (company_id, user_id, date, status, approval_status)
    values ((select acme_id from t_ctx), auth.uid(), '2026-11-17', 'vacation', 'approved')$$,
  'member nem hagyhatja jóvá a saját szabadságát');
select pg_temp.expect_fail(
  $$insert into public.schedules (company_id, user_id, date, status)
    values ((select acme_id from t_ctx), '00000000-0000-0000-0000-00000000000d', '2026-11-17', 'office')$$,
  'member nem írhat más nevére');
insert into public.schedules (company_id, user_id, date, status, approval_status, request_group_id)
  values ((select acme_id from t_ctx), auth.uid(), '2026-11-18', 'vacation', 'pending', '11111111-1111-1111-1111-111111111111'),
         ((select acme_id from t_ctx), auth.uid(), '2026-11-19', 'vacation', 'pending', '11111111-1111-1111-1111-111111111111');
select pg_temp.expect_fail(
  $$update public.schedules set approval_status = 'approved' where request_group_id = '11111111-1111-1111-1111-111111111111'$$,
  'member nem hagyhatja jóvá utólag sem');
select pg_temp.expect_fail(
  $$insert into public.schedules (company_id, user_id, date, status, approval_status)
    values ((select acme_id from t_ctx), auth.uid(), '2026-11-20', 'office', 'pending')$$,
  'irodai napnak nincs függő státusza');
-- upsert (gyors váltás)
insert into public.schedules (company_id, user_id, date, status)
  values ((select acme_id from t_ctx), auth.uid(), '2026-11-16', 'remote')
  on conflict (user_id, date) do update set status = excluded.status;
select pg_temp.expect_eq((select count(*) from public.schedules where date = '2026-11-16' and status = 'remote'), 1, 'upsert gyors váltás');

-- Másik cég nem lát semmit
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_eq((select count(*) from public.schedules), 0, 'tenant izoláció: schedules');
select pg_temp.expect_eq((select count(*) from public.profiles), 1, 'tenant izoláció: profiles');
update public.schedules set approval_status = 'approved';
reset role;
select pg_temp.expect_eq((select count(*) from public.schedules where approval_status = 'approved' and status = 'vacation'), 0, 'idegen admin nem bírálhat el');
set role authenticated;

-- Kolléga (member) lát mindent a cégben, de nem bírálhat
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.expect_eq((select count(*) from public.schedules), 3, 'kolléga látja a cég összes sorát');
update public.schedules set approval_status = 'approved' where status = 'vacation';
select pg_temp.expect_eq((select count(*) from public.schedules where approval_status = 'approved' and status = 'vacation'), 0, 'kolléga nem bírálhat el');

-- Admin elbírálás
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update public.schedules set approval_status = 'approved' where request_group_id = '11111111-1111-1111-1111-111111111111';
select pg_temp.expect_eq(
  (select count(*) from public.schedules where approval_status = 'approved' and reviewed_by = auth.uid() and status = 'vacation'),
  2, 'admin jóváhagyta, reviewed_by beállítva');
select pg_temp.expect_fail(
  $$update public.schedules set status = 'office' where request_group_id = '11111111-1111-1111-1111-111111111111'$$,
  'admin nem írhatja át más státuszát');
delete from public.schedules where user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_eq((select count(*) from public.schedules where user_id = '00000000-0000-0000-0000-00000000000b'), 3, 'admin nem törölheti más sorát');
insert into public.schedules (company_id, user_id, date, status, approval_status)
  values ((select acme_id from t_ctx), auth.uid(), '2026-11-20', 'vacation', 'approved');
select pg_temp.expect_eq((select count(*) from public.schedules where user_id = auth.uid() and status = 'vacation' and approval_status = 'approved'), 1, 'admin saját szabadsága azonnal jóváhagyott');

-- Member saját jóváhagyott szabadságának módosítása -> csak pending lehet
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_fail(
  $$update public.schedules set note = 'x' where request_group_id = '11111111-1111-1111-1111-111111111111'$$,
  'jóváhagyott szabadság csendes módosítása tiltott (vissza kell pendingre)');

-- ---------------------------------------------------------------- Orvosi igazolás
insert into public.schedules (company_id, user_id, date, status, request_group_id)
  values ((select acme_id from t_ctx), auth.uid(), '2026-11-23', 'sick', '22222222-2222-2222-2222-222222222222');
select pg_temp.expect_fail(
  $$insert into public.medical_documents (company_id, user_id, request_group_id, storage_path, file_name, mime_type)
    values ((select acme_id from t_ctx), auth.uid(), '11111111-1111-1111-1111-111111111111', 'x/y', 'a.pdf', 'application/pdf')$$,
  'igazolás csak betegszabadsághoz csatolható');
insert into public.medical_documents (company_id, user_id, request_group_id, storage_path, file_name, mime_type)
  values ((select acme_id from t_ctx), auth.uid(), '22222222-2222-2222-2222-222222222222',
          (select acme_id from t_ctx)::text || '/' || auth.uid()::text || '/22222222-2222-2222-2222-222222222222/igazolas.pdf',
          'igazolas.pdf', 'application/pdf');
insert into storage.objects (bucket_id, name)
  values ('medical-docs', (select acme_id from t_ctx)::text || '/' || auth.uid()::text || '/22222222-2222-2222-2222-222222222222/igazolas.pdf');
select pg_temp.expect_fail(
  $$insert into storage.objects (bucket_id, name)
    values ('medical-docs', (select acme_id from t_ctx)::text || '/00000000-0000-0000-0000-00000000000d/g/hamis.pdf')$$,
  'nem tölthet fel más mappájába');
select pg_temp.expect_eq((select count(*) from public.medical_documents), 1, 'feltöltő látja a saját igazolását');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.expect_eq((select count(*) from public.medical_documents), 0, 'kolléga NEM látja az igazolás metaadatát');
select pg_temp.expect_eq((select count(*) from storage.objects), 0, 'kolléga NEM látja a fájlt');
select pg_temp.expect_eq((select count(*) from public.schedules where status = 'sick'), 1, 'kolléga látja, hogy beteg');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_eq((select count(*) from storage.objects), 0, 'idegen cég admin NEM látja a fájlt');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect_eq((select count(*) from public.medical_documents), 1, 'admin látja az igazolást');
select pg_temp.expect_eq((select count(*) from storage.objects), 1, 'admin látja a fájlt');

-- ---------------------------------------------------------------- Szerepkörök
select pg_temp.expect_fail($$select public.set_member_role(auth.uid(), 'member')$$, 'utolsó admin nem fokozható le');
select public.set_member_role('00000000-0000-0000-0000-00000000000d', 'admin');
select public.set_member_role(auth.uid(), 'member');
select pg_temp.expect_eq((select count(*) from public.profiles where id = auth.uid() and role = 'member'), 1, 'lefokozás, ha van másik admin');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_fail($$select public.set_member_role('00000000-0000-0000-0000-00000000000b', 'admin')$$, 'idegen admin nem módosíthat szerepet');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select public.remove_member('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_eq((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 0, 'eltávolított tag nem látszik');
select pg_temp.expect_eq((select count(*) from public.medical_documents), 1, 'igazolás megmarad az adminnak');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_eq((select count(*) from public.schedules), 0, 'eltávolított tag már nem lát cégadatot');
select pg_temp.expect_eq((select count(*) from public.medical_documents), 0, 'eltávolított tag cégadatot nem lát');

reset role;
\echo 'MINDEN RLS TESZT SIKERES'
