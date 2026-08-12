-- =============================================================================
-- PROMPT EDU ERP — Migration 0020: institution self-service branding.
--
-- 0001_foundation.sql's institutions_write policy deliberately restricts
-- EVERY write on `institutions` (status, type, plan_id, ...) to Super Admin
-- only — those fields have platform-wide implications (§W). Cosmetic
-- branding (primary_color / secondary_color, both already provisioned as
-- columns in 0001 but never wired up until now) is a fundamentally
-- different, self-contained action: an institution admin choosing "what
-- colour is my own portal" has no effect on any other tenant or on the
-- platform.
--
-- This adds a second, PERMISSIVE update policy (Postgres OR's permissive
-- policies together for the same command), scoped by the same institution_id
-- equality check used by every other tenant-owned table in this schema
-- (§E.1) — NOT by is_super_admin. It does not, by itself, restrict WHICH
-- columns get written; that's enforced the same way column-level
-- authorization always is in this codebase (§X "never trust the client"):
-- application code only ever exposes this write through
-- services/institution/institution-service.ts's updateInstitutionBranding(),
-- which is the only function that runs an UPDATE on this table without
-- withSuperAdminContext, and is only ever reachable through a server action
-- gated on the settings.manage permission
-- (app/(institution)/settings/actions.ts) — the same "RLS = tenant
-- isolation, application layer = which action" split used everywhere else.
-- =============================================================================

create policy institutions_update_self on institutions for update
  using (id = nullif(current_setting('app.current_institution_id', true), '')::uuid)
  with check (id = nullif(current_setting('app.current_institution_id', true), '')::uuid);
