-- =============================================================================
-- PROMPT EDU ERP — Migration 0002: application runtime role
--
-- Why this exists: Postgres RLS policies do NOT apply to a table's owner or
-- to a superuser role, regardless of how many policies are defined (this is
-- standard Postgres behaviour, not a bug). Migrations run as a privileged
-- role (table owner) by design — but application request traffic must run as
-- a role that is NEITHER the owner NOR a superuser, or RLS is silently
-- bypassed end to end.
--
-- In production (Supabase/Neon), this separation already exists naturally:
-- migrations run via a privileged/service connection, while application
-- queries run as Supabase's `authenticated`/`anon` Postgres role (a distinct,
-- non-owner, non-superuser role with no BYPASSRLS). This migration creates
-- the local equivalent — `app_user` — so the SAME separation holds when
-- developing/testing against local PGlite (§E.1/§E.4), otherwise a
-- tenant-isolation bug could pass every test locally yet exist in reality.
--
-- services/db/client.ts issues `SET LOCAL ROLE app_user` at the start of
-- every `withInstitutionContext` transaction so runtime queries always run
-- under this restricted role, never as the migration owner.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nosuperuser nocreatedb nocreaterole nobypassrls noinherit login;
  end if;
end $$;

grant usage on schema public to app_user;

-- Present + future tables — new migrations don't need to remember to re-grant.
grant select, insert, update, delete on all tables in schema public to app_user;
alter default privileges in schema public
  grant select, insert, update, delete on tables to app_user;

grant usage, select on all sequences in schema public to app_user;
alter default privileges in schema public
  grant usage, select on sequences to app_user;
