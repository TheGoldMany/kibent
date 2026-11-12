-- Kibent RLS / üzleti szabály tesztek (helyi Postgres + _neon_stub.sql)
-- Futtatás: npm run test:db  (db/tests/run.sh)
\set ON_ERROR_STOP on
set client_min_messages = notice;
reset role;

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

grant execute on all functions in schema pg_temp to kibent_app;

-- Felhasználók
insert into neon_auth."user" (id, email, name) values
  ('00000000-0000-0000-0000-00000000000a', 'anna@acme.hu', 'Kovács Anna'),
  ('00000000-0000-0000-0000-00000000000b', 'bela@acme.hu', ''),
  ('00000000-0000-0000-0000-00000000000c', 'cili@other.hu', 'Szabó Cili'),
  ('00000000-0000-0000-0000-00000000000d', 'dani@acme.hu', 'Tóth Dani');

select pg_temp.expect_eq((select count(*) from public.profiles), 4, 'trigger létrehozta a profilokat');
select pg_temp.expect_eq(
  (select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000b' and full_name = 'bela'),
  1, 'full_name fallback email előtagra');

-- ---------------------------------------------------------------- Onboarding
set role kibent_app;
set app.user_id = '00000000-0000-0000-0000-00000000000a';
select public.create_company('Acme Kft.');
select pg_temp.expect_eq((select count(*) from public.profiles where id = app.uid() and role = 'admin'), 1, 'cég létrehozója admin');
select pg_temp.expect_eq((select count(*) from public.companies where char_length(invite_code) = 8), 1, '8 karakteres meghívókód');
select pg_temp.expect_fail($$select public.create_company('Második')$$, 'második cég létrehozása tiltott');

reset role;
create temp table t_ctx as select id as acme_id, invite_code from public.companies;
grant select on t_ctx to kibent_app;

set role kibent_app;
set app.user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_fail($$select public.join_company('ROSSZKOD')$$, 'érvénytelen meghívókód');
select public.join_company((select lower(invite_code) from t_ctx));
select pg_temp.expect_eq((select count(*) from public.profiles where id = app.uid() and role = 'member' and company_id is not null), 1, 'meghívóval member lett (kis/nagybetű független)');

set app.user_id = '00000000-0000-0000-0000-00000000000d';
select public.join_company((select invite_code from t_ctx));

set app.user_id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_eq((select count(*) from public.profiles), 1, 'cég nélküli user csak magát látja');
select public.create_company('Other Zrt.');
select pg_temp.expect_fail($$select public.join_company((select invite_code from t_ctx))$$, 'másik cég tagja nem csatlakozhat');

-- ---------------------------------------------------------------- Profil védelem
set app.user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_fail($$update public.profiles set role = 'admin' where id = app.uid()$$, 'member nem léptetheti elő magát');
select pg_temp.expect_fail($$update public.profiles set company_id = null where id = app.uid()$$, 'company_id nem írható közvetlenül');
update public.profiles set full_name = 'Nagy Béla' where id = app.uid();
select pg_temp.expect_eq((select count(*) from public.profiles where full_name = 'Nagy Béla'), 1, 'saját név módosítható');
select pg_temp.expect_fail($$select public.regenerate_invite_code()$$, 'member nem generálhat meghívókódot');
update public.companies set name = 'Hack';
select pg_temp.expect_eq((select count(*) from public.companies where name = 'Hack'), 0, 'member cégátnevezése hatástalan');

-- ---------------------------------------------------------------- Schedules
insert into public.schedules (company_id, user_id, date, status)
  values ((select acme_id from t_ctx), app.uid(), '2026-11-16', 'office');
select pg_temp.expect_fail(
  $$insert into public.schedules (company_id, user_id, date, status, approval_status)
    values ((select acme_id from t_ctx), app.uid(), '2026-11-17', 'vacation', 'approved')$$,
  'member nem hagyhatja jóvá a saját szabadságát');
select pg_temp.expect_fail(
  $$insert into public.schedules (company_id, user_id, date, status)
    values ((select acme_id from t_ctx), '00000000-0000-0000-0000-00000000000d', '2026-11-17', 'office')$$,
  'member nem írhat más nevére');
insert into public.schedules (company_id, user_id, date, status, approval_status, request_group_id)
  values ((select acme_id from t_ctx), app.uid(), '2026-11-18', 'vacation', 'pending', '11111111-1111-1111-1111-111111111111'),
         ((select acme_id from t_ctx), app.uid(), '2026-11-19', 'vacation', 'pending', '11111111-1111-1111-1111-111111111111');
select pg_temp.expect_fail(
  $$update public.schedules set approval_status = 'approved' where request_group_id = '11111111-1111-1111-1111-111111111111'$$,
  'member nem hagyhatja jóvá utólag sem');
select pg_temp.expect_fail(
  $$insert into public.schedules (company_id, user_id, date, status, approval_status)
    values ((select acme_id from t_ctx), app.uid(), '2026-11-20', 'office', 'pending')$$,
  'irodai napnak nincs függő státusza');
-- upsert (gyors váltás)
insert into public.schedules (company_id, user_id, date, status)
  values ((select acme_id from t_ctx), app.uid(), '2026-11-16', 'remote')
  on conflict (user_id, date) do update set status = excluded.status;
select pg_temp.expect_eq((select count(*) from public.schedules where date = '2026-11-16' and status = 'remote'), 1, 'upsert gyors váltás');

-- Másik cég nem lát semmit
set app.user_id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_eq((select count(*) from public.schedules), 0, 'tenant izoláció: schedules');
select pg_temp.expect_eq((select count(*) from public.profiles), 1, 'tenant izoláció: profiles');
update public.schedules set approval_status = 'approved';
reset role;
select pg_temp.expect_eq((select count(*) from public.schedules where approval_status = 'approved' and status = 'vacation'), 0, 'idegen admin nem bírálhat el');
set role kibent_app;

-- Kolléga (member) lát mindent a cégben, de nem bírálhat
set app.user_id = '00000000-0000-0000-0000-00000000000d';
select pg_temp.expect_eq((select count(*) from public.schedules), 3, 'kolléga látja a cég összes sorát');
update public.schedules set approval_status = 'approved' where status = 'vacation';
select pg_temp.expect_eq((select count(*) from public.schedules where approval_status = 'approved' and status = 'vacation'), 0, 'kolléga nem bírálhat el');

-- Admin elbírálás
set app.user_id = '00000000-0000-0000-0000-00000000000a';
update public.schedules set approval_status = 'approved' where request_group_id = '11111111-1111-1111-1111-111111111111';
select pg_temp.expect_eq(
  (select count(*) from public.schedules where approval_status = 'approved' and reviewed_by = app.uid() and status = 'vacation'),
  2, 'admin jóváhagyta, reviewed_by beállítva');
select pg_temp.expect_fail(
  $$update public.schedules set status = 'office' where request_group_id = '11111111-1111-1111-1111-111111111111'$$,
  'admin nem írhatja át más státuszát');
delete from public.schedules where user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_eq((select count(*) from public.schedules where user_id = '00000000-0000-0000-0000-00000000000b'), 3, 'admin nem törölheti más sorát');
insert into public.schedules (company_id, user_id, date, status, approval_status)
  values ((select acme_id from t_ctx), app.uid(), '2026-11-20', 'vacation', 'approved');
select pg_temp.expect_eq((select count(*) from public.schedules where user_id = app.uid() and status = 'vacation' and approval_status = 'approved'), 1, 'admin saját szabadsága azonnal jóváhagyott');

-- Member saját jóváhagyott szabadságának módosítása -> csak pending lehet
set app.user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_fail(
  $$update public.schedules set note = 'x' where request_group_id = '11111111-1111-1111-1111-111111111111'$$,
  'jóváhagyott szabadság csendes módosítása tiltott (vissza kell pendingre)');

-- ---------------------------------------------------------------- Orvosi igazolás
insert into public.schedules (company_id, user_id, date, status, request_group_id)
  values ((select acme_id from t_ctx), app.uid(), '2026-11-23', 'sick', '22222222-2222-2222-2222-222222222222');
select pg_temp.expect_fail(
  $$insert into public.medical_documents (company_id, user_id, request_group_id, storage_path, file_name, mime_type)
    values ((select acme_id from t_ctx), app.uid(), '11111111-1111-1111-1111-111111111111', 'x/y', 'a.pdf', 'application/pdf')$$,
  'igazolás csak betegszabadsághoz csatolható');
insert into public.medical_documents (company_id, user_id, request_group_id, storage_path, file_name, mime_type)
  values ((select acme_id from t_ctx), app.uid(), '22222222-2222-2222-2222-222222222222',
          (select acme_id from t_ctx)::text || '/' || app.uid()::text || '/22222222-2222-2222-2222-222222222222/igazolas.pdf',
          'igazolas.pdf', 'application/pdf');
select pg_temp.expect_fail(
  $$insert into public.medical_documents (company_id, user_id, request_group_id, storage_path, file_name, mime_type)
    values ((select acme_id from t_ctx), '00000000-0000-0000-0000-00000000000d', '22222222-2222-2222-2222-222222222222', 'x/hamis', 'a.pdf', 'application/pdf')$$,
  'member nem rögzíthet igazolást más nevére');
select pg_temp.expect_eq((select count(*) from public.medical_documents), 1, 'feltöltő látja a saját igazolását');

set app.user_id = '00000000-0000-0000-0000-00000000000d';
select pg_temp.expect_eq((select count(*) from public.medical_documents), 0, 'kolléga NEM látja az igazolás metaadatát');
select pg_temp.expect_eq((select count(*) from public.schedules where status = 'sick'), 1, 'kolléga látja, hogy beteg');

set app.user_id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_eq((select count(*) from public.medical_documents), 0, 'idegen cég admin NEM látja az igazolást');

set app.user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect_eq((select count(*) from public.medical_documents), 1, 'admin látja az igazolást');

-- ---------------------------------------------------------------- Szerepkörök
select pg_temp.expect_fail($$select public.set_member_role(app.uid(), 'member')$$, 'utolsó admin nem fokozható le');
select public.set_member_role('00000000-0000-0000-0000-00000000000d', 'admin');
select public.set_member_role(app.uid(), 'member');
select pg_temp.expect_eq((select count(*) from public.profiles where id = app.uid() and role = 'member'), 1, 'lefokozás, ha van másik admin');
set app.user_id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_fail($$select public.set_member_role('00000000-0000-0000-0000-00000000000b', 'admin')$$, 'idegen admin nem módosíthat szerepet');

set app.user_id = '00000000-0000-0000-0000-00000000000d';
select public.remove_member('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_eq((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 0, 'eltávolított tag nem látszik');
select pg_temp.expect_eq((select count(*) from public.medical_documents), 1, 'igazolás megmarad az adminnak');

set app.user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_eq((select count(*) from public.schedules), 0, 'eltávolított tag már nem lát cégadatot');
select pg_temp.expect_eq((select count(*) from public.medical_documents), 0, 'eltávolított tag cégadatot nem lát');

select pg_temp.expect_fail($$insert into public.companies (name) values ('Kalóz Kft.')$$, 'kibent_app nem hozhat létre céget közvetlenül');
select pg_temp.expect_fail($$select * from neon_auth."user"$$, 'kibent_app nem olvassa a neon_auth sémát');
set app.user_id = '';
select pg_temp.expect_eq((select count(*) from public.schedules), 0, 'user_id nélkül semmi sem látszik');

-- ---------------------------------------------------------------- 0002: munkaidő, ebédszünet, meghívók
reset role;
create temp table t_ctx2 as
  select (select id from public.companies where name like 'Acme%') as acme_id,
         (select id from public.companies where name like 'Other%') as other_id;
grant select on t_ctx2 to kibent_app;
set role kibent_app;

-- Ebédszünet hossza: csak admin (D) állíthatja
set app.user_id = '00000000-0000-0000-0000-00000000000d';
update public.companies set lunch_minutes = 45;
set app.user_id = '00000000-0000-0000-0000-00000000000a';
update public.companies set lunch_minutes = 90;
reset role;
select pg_temp.expect_eq((select lunch_minutes from public.companies where id = (select acme_id from t_ctx2))::bigint, 45, 'ebédszünet hosszát csak admin állítja');
set role kibent_app;

-- Munkaidő
set app.user_id = '00000000-0000-0000-0000-00000000000a';
insert into public.work_hours (user_id, company_id, weekday, start_time, end_time, lunch_start)
  values (app.uid(), (select acme_id from t_ctx2), 1, '09:00', '17:00', '12:00');
select pg_temp.expect_fail(
  $$insert into public.work_hours (user_id, company_id, weekday, start_time, end_time, lunch_start)
    values (app.uid(), (select acme_id from t_ctx2), 2, '09:00', '17:00', '18:00')$$,
  'ebéd a munkaidőn kívül tiltott');
select pg_temp.expect_fail(
  $$insert into public.work_hours (user_id, company_id, weekday, start_time, end_time)
    values (app.uid(), (select acme_id from t_ctx2), 3, '17:00', '09:00')$$,
  'munkaidő vége nem lehet a kezdet előtt');
select pg_temp.expect_fail(
  $$insert into public.work_hours (user_id, company_id, weekday, start_time, end_time)
    values ('00000000-0000-0000-0000-00000000000d', (select acme_id from t_ctx2), 1, '09:00', '17:00')$$,
  'más munkaidejét nem írhatod');
set app.user_id = '00000000-0000-0000-0000-00000000000d';
select pg_temp.expect_eq((select count(*) from public.work_hours), 1, 'kolléga látja a cég munkaidőit');
update public.work_hours set start_time = '06:00';
reset role;
select pg_temp.expect_eq((select count(*) from public.work_hours where start_time = '06:00'), 0, 'kolléga nem módosíthatja más munkaidejét');
set role kibent_app;
set app.user_id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_eq((select count(*) from public.work_hours), 0, 'tenant izoláció: munkaidő');

-- Meghívók
set app.user_id = '00000000-0000-0000-0000-00000000000d';
insert into public.company_invitations (company_id, email, invited_by)
  values ((select acme_id from t_ctx2), 'bela@acme.hu', app.uid()),
         ((select acme_id from t_ctx2), 'valaki@pelda.hu', app.uid());
select pg_temp.expect_fail(
  $$insert into public.company_invitations (company_id, email, invited_by)
    values ((select acme_id from t_ctx2), 'bela@acme.hu', app.uid())$$,
  'egy címre csak egy nyitott meghívó');
select pg_temp.expect_fail(
  $$insert into public.company_invitations (company_id, email, invited_by)
    values ((select acme_id from t_ctx2), 'Nagybetus@Pelda.hu', app.uid())$$,
  'email csak kisbetűs lehet');
select pg_temp.expect_eq((select count(*) from public.company_invitations), 2, 'admin látja a meghívókat');

set app.user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect_fail(
  $$insert into public.company_invitations (company_id, email, invited_by)
    values ((select acme_id from t_ctx2), 'hacker@pelda.hu', app.uid())$$,
  'member nem hívhat meg senkit');
select pg_temp.expect_eq((select count(*) from public.company_invitations), 0, 'member nem látja a meghívókat (tokeneket)');

set app.user_id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_eq((select count(*) from public.company_invitations), 0, 'idegen admin nem látja a meghívókat');

-- Token elfogadása rossz email címmel
reset role;
create temp table t_tok as select token from public.company_invitations where email = 'valaki@pelda.hu';
grant select on t_tok to kibent_app;
set role kibent_app;
set app.user_id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_fail($$select public.accept_invitation((select token from t_tok))$$, 'más címre szóló meghívó nem fogadható el');

-- Automatikus csatlakozás belépéskor (B már nincs cégben, email: bela@acme.hu)
set app.user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_eq(
  (select (public.accept_pending_invitation() = (select acme_id from t_ctx2))::int)::bigint, 1,
  'nyitott meghívó alapján automatikusan csatlakozik');
select pg_temp.expect_eq((select count(*) from public.profiles where id = app.uid() and company_id is not null and role = 'member'), 1, 'member szerepkörrel került a cégbe');
select pg_temp.expect_eq((select (public.accept_pending_invitation() is null)::int)::bigint, 1, 'második hívás nem csinál semmit');
reset role;
select pg_temp.expect_eq((select count(*) from public.company_invitations where email = 'bela@acme.hu' and accepted_by is not null), 1, 'meghívó elfogadottnak jelölve');

reset role;
\echo 'MINDEN RLS TESZT SIKERES'
