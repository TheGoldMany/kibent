-- =============================================================================
-- Félbeszakadt 0001_init.sql migráció takarítása (CSAK üres, friss telepítésnél!)
-- Ha bármelyik Kibent táblában van adat, a szkript hibával leáll és nem töröl.
-- A neon_auth sémához (felhasználók) NEM nyúl.
-- =============================================================================
do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['companies', 'profiles', 'recurring_patterns', 'schedules', 'medical_documents'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then
        raise exception 'A public.% táblában % sor van – a takarítás leállt, semmi sem törlődött.', t, n;
      end if;
    end if;
  end loop;
end
$$;

do $$
begin
  drop trigger if exists on_auth_user_created on neon_auth."user";
  drop trigger if exists on_auth_user_email_changed on neon_auth."user";
exception when insufficient_privilege or undefined_table then
  null; -- nem is jöhetett létre
end
$$;

drop table if exists public.medical_documents, public.schedules, public.recurring_patterns,
                     public.profiles, public.companies cascade;

drop function if exists public.generate_invite_code() cascade;
drop function if exists public.auth_company_id() cascade;
drop function if exists public.is_company_admin() cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.handle_user_email_change() cascade;
drop function if exists public.ensure_profile(text, text) cascade;
drop function if exists public.schedules_guard() cascade;
drop function if exists public.touch_updated_at() cascade;
drop function if exists public.create_company(text) cascade;
drop function if exists public.join_company(text) cascade;
drop function if exists public.preview_invite(text) cascade;
drop function if exists public.regenerate_invite_code() cascade;
drop function if exists public.regenerate_ical_token() cascade;
drop function if exists public.set_member_role(uuid, text) cascade;
drop function if exists public.remove_member(uuid) cascade;
drop schema if exists app cascade;
-- A kibent_app szerepkör megmarad; a migráció újrafuttatáskor újrahasznosítja.
