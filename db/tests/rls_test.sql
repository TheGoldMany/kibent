-- Kibent RLS / üzleti szabály tesztek (helyi Postgres, Better Auth sémával)
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
insert into better_auth."user" (id, email, name, "emailVerified") values
  ('00000000-0000-0000-0000-00000000000a', 'anna@acme.hu', 'Kovács Anna', true),
  ('00000000-0000-0000-0000-00000000000b', 'bela@acme.hu', '', true),
  ('00000000-0000-0000-0000-00000000000c', 'cili@other.hu', 'Szabó Cili', true),
  ('00000000-0000-0000-0000-00000000000d', 'dani@acme.hu', 'Tóth Dani', true);

-- Profilok az első belépéskor (ensure_profile)
set role kibent_app;
set app.user_id = '00000000-0000-0000-0000-00000000000a'; select public.ensure_profile('anna@acme.hu', 'Kovács Anna');
set app.user_id = '00000000-0000-0000-0000-00000000000b'; select public.ensure_profile('bela@acme.hu', '');
set app.user_id = '00000000-0000-0000-0000-00000000000c'; select public.ensure_profile('cili@other.hu', 'Szabó Cili');
set app.user_id = '00000000-0000-0000-0000-00000000000d'; select public.ensure_profile('dani@acme.hu', 'Tóth Dani');
select public.ensure_profile('dani@acme.hu', 'Tóth Dani'); -- idempotens
reset role;

select pg_temp.expect_eq((select count(*) from public.profiles), 4, 'ensure_profile létrehozta a profilokat');
select pg_temp.expect_eq(
  (select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000b' and full_name = 'bela'),
  1, 'full_name fallback email előtagra');
select pg_temp.expect_fail(
  $$insert into public.profiles (id, email, full_name) values (gen_random_uuid(), 'x@y.hu', 'X')$$,
  'profil csak létező fiókhoz tartozhat');

-- ---------------------------------------------------------------- Csapatok
-- Bárki létrehozhat csapatot, akár többet is; a létrehozó admin lesz.
set role kibent_app;
set app.user_id = '00000000-0000-0000-0000-00000000000a';
set app.company_id = '';
select pg_temp.expect_eq((select count(*) from public.profiles), 1, 'csapat nélkül csak magát látja');
select public.create_company('Acme Kft.');
select public.create_company('Acme Labs');
select pg_temp.expect_eq((select count(*) from public.memberships where user_id = app.uid() and role = 'admin'), 2, 'két csapat, mindkettőben admin');
select pg_temp.expect_eq((select count(*) from public.companies), 2, 'látja mindkét saját csapatát');
select pg_temp.expect_fail($$select public.create_company('   ')$$, 'üres csapatnév tiltott');

set app.user_id = '00000000-0000-0000-0000-00000000000c';
select public.create_company('Other Zrt.');
select pg_temp.expect_eq((select count(*) from public.companies), 1, 'idegen csapatot nem lát');

reset role;
create temp table t_ctx as
  select (select id from public.companies where name = 'Acme Kft.') as acme_id,
         (select id from public.companies where name = 'Acme Labs') as labs_id,
         (select id from public.companies where name = 'Other Zrt.') as other_id;
grant select on t_ctx to kibent_app;

-- Meghívók az Acme-ba (A, admin, aktív csapat: Acme)
set role kibent_app;
set app.user_id = '00000000-0000-0000-0000-00000000000a';
select set_config('app.company_id', (select acme_id::text from t_ctx), false);
insert into public.company_invitations (company_id, email, invited_by)
  values ((select acme_id from t_ctx), 'bela@acme.hu', app.uid()),
         ((select acme_id from t_ctx), 'dani@acme.hu', app.uid()),
         ((select acme_id from t_ctx), 'valaki@pelda.hu', app.uid());
select pg_temp.expect_fail(
  $$insert into public.company_invitations (company_id, email, invited_by)
    values ((select acme_id from t_ctx), 'bela@acme.hu', app.uid())$$,
  'egy címre csak egy nyitott meghívó');
select pg_temp.expect_fail(
  $$insert into public.company_invitations (company_id, email, invited_by)
    values ((select acme_id from t_ctx), 'Nagybetus@Pelda.hu', app.uid())$$,
  'email csak kisbetűs lehet');
select pg_temp.expect_fail(
  $$insert into public.company_invitations (company_id, email, invited_by)
    values ((select other_id from t_ctx), 'x@pelda.hu', app.uid())$$,
  'más csapatába nem hívhat meg');
select pg_temp.expect_eq((select count(*) from public.company_invitations), 3, 'admin látja a meghívókat');

-- Aktív csapat nélkül (vagy idegen csapattal) nincs admin-jog
select set_config('app.company_id', (select other_id::text from t_ctx), false);
select pg_temp.expect_eq((select count(*) from public.company_invitations), 0, 'nem tag csapatra váltva semmit sem lát');

reset role;
create temp table t_tok as
  select (select token from public.company_invitations where email = 'bela@acme.hu') as bela,
         (select token from public.company_invitations where email = 'dani@acme.hu') as dani,
         (select token from public.company_invitations where email = 'valaki@pelda.hu') as valaki;
grant select on t_tok to kibent_app;
set role kibent_app;

-- Elfogadás: a link a bizonyíték
set app.company_id = '';
set app.user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_fail($$select public.accept_invitation(gen_random_uuid())$$, 'ismeretlen meghívó');
select pg_temp.expect_eq((select (public.accept_invitation((select bela from t_tok)) = (select acme_id from t_ctx))::int)::bigint, 1, 'B elfogadta a meghívót');
select pg_temp.expect_eq((select count(*) from public.memberships where user_id = app.uid() and role = 'member'), 1, 'member tagság jött létre');
select pg_temp.expect_eq((select (public.accept_invitation((select bela from t_tok)) = (select acme_id from t_ctx))::int)::bigint, 1, 'újra megnyitva sem hiba (már tag)');

set app.user_id = '00000000-0000-0000-0000-00000000000d';
select public.accept_invitation((select dani from t_tok));

-- C (Other Zrt. admin) is elfogadhat egy meghívót: több csapat tagja lesz
set app.user_id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_fail($$select public.accept_invitation((select bela from t_tok))$$, 'felhasznált meghívó nem használható újra');
select public.accept_invitation((select valaki from t_tok));
select pg_temp.expect_eq((select count(*) from public.memberships where user_id = app.uid()), 2, 'C két csapat tagja');
reset role;
update public.company_invitations set expires_at = now() - interval '1 day', accepted_at = null, accepted_by = null
 where token = (select valaki from t_tok);
delete from public.memberships where user_id = '00000000-0000-0000-0000-00000000000c' and company_id = (select acme_id from t_ctx);
set role kibent_app;
select pg_temp.expect_fail($$select public.accept_invitation((select valaki from t_tok))$$, 'lejárt meghívó');
select pg_temp.expect_fail($$select public.join_company('ABCDEFGH')$$, 'a régi meghívókódos csatlakozás kivezetve');

-- ---------------------------------------------------------------- Aktív csapat
set app.user_id = '00000000-0000-0000-0000-00000000000b';
set app.company_id = '';
select pg_temp.expect_eq((select count(*) from public.profiles), 1, 'aktív csapat nélkül csak magát látja');
select set_config('app.company_id', (select labs_id::text from t_ctx), false);
select pg_temp.expect_eq((select count(*) from public.profiles), 1, 'nem tag csapatra váltva sem lát mást');
select set_config('app.company_id', (select acme_id::text from t_ctx), false);
select pg_temp.expect_eq((select count(*) from public.profiles), 3, 'aktív csapat tagjait látja');
select pg_temp.expect_eq((select count(*) from public.memberships), 3, 'aktív csapat tagságait látja');

-- ---------------------------------------------------------------- Profil védelem
select pg_temp.expect_fail($$update public.profiles set role = 'admin' where id = app.uid()$$, 'member nem léptetheti elő magát');
select pg_temp.expect_fail($$update public.memberships set role = 'admin' where user_id = app.uid()$$, 'tagság nem írható közvetlenül');
select pg_temp.expect_fail($$insert into public.memberships (user_id, company_id) values (app.uid(), (select labs_id from t_ctx))$$, 'tagság nem vehető fel közvetlenül');
update public.profiles set full_name = 'Nagy Béla' where id = app.uid();
select pg_temp.expect_eq((select count(*) from public.profiles where full_name = 'Nagy Béla'), 1, 'saját név módosítható');
update public.companies set name = 'Hack';
reset role;
select pg_temp.expect_eq((select count(*) from public.companies where name = 'Hack'), 0, 'member cégátnevezése hatástalan');
set role kibent_app;
select set_config('app.company_id', (select acme_id::text from t_ctx), false);
set app.user_id = '00000000-0000-0000-0000-00000000000b';

-- ---------------------------------------------------------------- Schedules
insert into public.schedules (company_id, user_id, date, status)
  values ((select acme_id from t_ctx), app.uid(), '2026-11-16', 'office');
select pg_temp.expect_fail(
  $$insert into public.schedules (company_id, user_id, date, status)
    values ((select labs_id from t_ctx), app.uid(), '2026-11-16', 'office')$$,
  'nem tag csapatba nem írhat');
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
insert into public.schedules (company_id, user_id, date, status)
  values ((select acme_id from t_ctx), app.uid(), '2026-11-16', 'remote')
  on conflict (user_id, company_id, date) do update set status = excluded.status;
select pg_temp.expect_eq((select count(*) from public.schedules where date = '2026-11-16' and status = 'remote'), 1, 'upsert gyors váltás');

-- Másik csapat nem lát semmit
set app.user_id = '00000000-0000-0000-0000-00000000000c';
select set_config('app.company_id', (select other_id::text from t_ctx), false);
select pg_temp.expect_eq((select count(*) from public.schedules), 0, 'tenant izoláció: schedules');
select pg_temp.expect_eq((select count(*) from public.profiles), 1, 'tenant izoláció: profiles');
update public.schedules set approval_status = 'approved';
select set_config('app.company_id', (select acme_id::text from t_ctx), false);
select pg_temp.expect_eq((select count(*) from public.schedules), 0, 'idegen csapatra váltva sem lát');
reset role;
select pg_temp.expect_eq((select count(*) from public.schedules where approval_status = 'approved' and status = 'vacation'), 0, 'idegen admin nem bírálhat el');
set role kibent_app;

-- Kolléga (member) lát mindent a csapatban, de nem bírálhat
set app.user_id = '00000000-0000-0000-0000-00000000000d';
select set_config('app.company_id', (select acme_id::text from t_ctx), false);
select pg_temp.expect_eq((select count(*) from public.schedules), 3, 'kolléga látja a csapat összes sorát');
update public.schedules set approval_status = 'approved' where status = 'vacation';
select pg_temp.expect_eq((select count(*) from public.schedules where approval_status = 'approved' and status = 'vacation'), 0, 'kolléga nem bírálhat el');

-- Admin elbírálás – csak az aktív csapatban admin
set app.user_id = '00000000-0000-0000-0000-00000000000a';
select set_config('app.company_id', (select labs_id::text from t_ctx), false);
update public.schedules set approval_status = 'approved' where request_group_id = '11111111-1111-1111-1111-111111111111';
select set_config('app.company_id', (select acme_id::text from t_ctx), false);
select pg_temp.expect_eq((select count(*) from public.schedules where approval_status = 'approved' and status = 'vacation'), 0, 'másik csapat adminjaként nem bírálhat');
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
-- Ugyanaz a nap egy másik csapatban külön bejegyzés
select set_config('app.company_id', (select labs_id::text from t_ctx), false);
insert into public.schedules (company_id, user_id, date, status)
  values ((select labs_id from t_ctx), app.uid(), '2026-11-20', 'office');
select pg_temp.expect_eq((select count(*) from public.schedules), 1, 'csapatonként külön beosztás');
select set_config('app.company_id', (select acme_id::text from t_ctx), false);

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
select pg_temp.expect_eq((select count(*) from public.medical_documents), 0, 'idegen csapat admin NEM látja az igazolást');

set app.user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect_eq((select count(*) from public.medical_documents), 1, 'admin látja az igazolást');

-- ---------------------------------------------------------------- Szerepkörök
select pg_temp.expect_fail($$select public.set_member_role(app.uid(), 'member')$$, 'utolsó admin nem fokozható le');
select public.set_member_role('00000000-0000-0000-0000-00000000000d', 'admin');
select public.set_member_role(app.uid(), 'member');
select pg_temp.expect_eq((select count(*) from public.memberships where user_id = app.uid() and role = 'member'), 1, 'lefokozás, ha van másik admin');
reset role;
select pg_temp.expect_eq((select count(*) from public.memberships where user_id = '00000000-0000-0000-0000-00000000000a' and role = 'admin'), 1, 'a másik csapatban admin marad');
set role kibent_app;
select set_config('app.company_id', (select acme_id::text from t_ctx), false);
set app.user_id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_fail($$select public.set_member_role('00000000-0000-0000-0000-00000000000b', 'admin')$$, 'idegen admin nem módosíthat szerepet');

set app.user_id = '00000000-0000-0000-0000-00000000000d';
select pg_temp.expect_fail($$select public.remove_member(app.uid())$$, 'saját magát nem távolíthatja el');
select public.remove_member('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_eq((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 0, 'eltávolított tag nem látszik');
select pg_temp.expect_eq((select count(*) from public.medical_documents), 1, 'igazolás megmarad az adminnak');

set app.user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_eq((select count(*) from public.schedules), 0, 'eltávolított tag már nem lát csapatadatot');
select pg_temp.expect_eq((select count(*) from public.medical_documents), 0, 'eltávolított tag igazolást sem lát');

select pg_temp.expect_fail($$insert into public.companies (name) values ('Kalóz Kft.')$$, 'kibent_app nem hozhat létre céget közvetlenül');
select pg_temp.expect_fail($$select * from better_auth."user"$$, 'kibent_app nem olvassa az auth sémát');
set app.user_id = '';
select pg_temp.expect_eq((select count(*) from public.schedules), 0, 'user_id nélkül semmi sem látszik');

-- ---------------------------------------------------------------- Munkaidő, ebédszünet
-- Ebédszünet hossza: csak admin (D) állíthatja
set app.user_id = '00000000-0000-0000-0000-00000000000a';
update public.companies set lunch_minutes = 90 where id = (select acme_id from t_ctx);
set app.user_id = '00000000-0000-0000-0000-00000000000d';
update public.companies set lunch_minutes = 45 where id = (select acme_id from t_ctx);
reset role;
select pg_temp.expect_eq((select lunch_minutes from public.companies where id = (select acme_id from t_ctx))::bigint, 45, 'ebédszünet hosszát csak admin állítja');
set role kibent_app;
select set_config('app.company_id', (select acme_id::text from t_ctx), false);

set app.user_id = '00000000-0000-0000-0000-00000000000a';
insert into public.work_hours (user_id, company_id, weekday, start_time, end_time, lunch_start)
  values (app.uid(), (select acme_id from t_ctx), 1, '09:00', '17:00', '12:00');
select pg_temp.expect_fail(
  $$insert into public.work_hours (user_id, company_id, weekday, start_time, end_time, lunch_start)
    values (app.uid(), (select acme_id from t_ctx), 2, '09:00', '17:00', '18:00')$$,
  'ebéd a munkaidőn kívül tiltott');
select pg_temp.expect_fail(
  $$insert into public.work_hours (user_id, company_id, weekday, start_time, end_time)
    values (app.uid(), (select acme_id from t_ctx), 3, '17:00', '09:00')$$,
  'munkaidő vége nem lehet a kezdet előtt');
select pg_temp.expect_fail(
  $$insert into public.work_hours (user_id, company_id, weekday, start_time, end_time)
    values ('00000000-0000-0000-0000-00000000000d', (select acme_id from t_ctx), 1, '09:00', '17:00')$$,
  'más munkaidejét nem írhatod');
select set_config('app.company_id', (select labs_id::text from t_ctx), false);
insert into public.work_hours (user_id, company_id, weekday, start_time, end_time)
  values (app.uid(), (select labs_id from t_ctx), 1, '10:00', '14:00');
select pg_temp.expect_eq((select count(*) from public.work_hours), 1, 'csapatonként külön munkaidő');
select set_config('app.company_id', (select acme_id::text from t_ctx), false);
set app.user_id = '00000000-0000-0000-0000-00000000000d';
select pg_temp.expect_eq((select count(*) from public.work_hours), 1, 'kolléga látja a csapat munkaidőit');
update public.work_hours set start_time = '06:00';
reset role;
select pg_temp.expect_eq((select count(*) from public.work_hours where start_time = '06:00'), 0, 'kolléga nem módosíthatja más munkaidejét');
set role kibent_app;
set app.user_id = '00000000-0000-0000-0000-00000000000c';
select set_config('app.company_id', (select other_id::text from t_ctx), false);
select pg_temp.expect_eq((select count(*) from public.work_hours), 0, 'tenant izoláció: munkaidő');

-- Meghívók láthatósága
set app.user_id = '00000000-0000-0000-0000-00000000000a';
select set_config('app.company_id', (select acme_id::text from t_ctx), false);
select pg_temp.expect_fail(
  $$insert into public.company_invitations (company_id, email, invited_by)
    values ((select acme_id from t_ctx), 'hacker@pelda.hu', app.uid())$$,
  'member nem hívhat meg senkit');
select pg_temp.expect_eq((select count(*) from public.company_invitations), 0, 'member nem látja a meghívókat (tokeneket)');
set app.user_id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_eq((select count(*) from public.company_invitations), 0, 'idegen admin nem látja a meghívókat');

-- ---------------------------------------------------------------- 0003: megerősítések
set app.user_id = '00000000-0000-0000-0000-00000000000d';
insert into public.schedules (company_id, user_id, date, status, request_group_id)
  values ((select acme_id from t_ctx), app.uid(), '2026-12-01', 'sick', '33333333-3333-3333-3333-333333333333');
set app.user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect_fail($$select public.rate_limit_hit('x', 1, 60)$$, 'kibent_app nem hívhatja a korlátozót');
reset role;
select pg_temp.expect_eq((select (public.rate_limit_hit('teszt', 2, 60))::int)::bigint, 1, 'korlátozó: 1. kérés átmegy');
select pg_temp.expect_eq((select (public.rate_limit_hit('teszt', 2, 60))::int)::bigint, 1, 'korlátozó: 2. kérés átmegy');
select pg_temp.expect_eq((select (public.rate_limit_hit('teszt', 2, 60))::int)::bigint, 0, 'korlátozó: 3. kérés tiltva');

-- ---------------------------------------------------------------- Profil: nincs email alapú átvétel
insert into better_auth."user" (id, email, name, "emailVerified")
  values ('00000000-0000-0000-0000-0000000000ef', 'anna@acme.hu.uj', 'Új Fiók', false);
set role kibent_app;
set app.user_id = '00000000-0000-0000-0000-0000000000ef';
set app.company_id = '';
select public.ensure_profile('anna@acme.hu', 'Hamis Anna');
select pg_temp.expect_eq((select count(*) from public.memberships where user_id = app.uid()), 0, 'azonos email cím sem ad tagságot');
reset role;
select pg_temp.expect_eq((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 1, 'a meglévő profil érintetlen');

reset role;
\echo 'MINDEN RLS TESZT SIKERES'
