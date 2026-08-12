-- =============================================================================
-- PROMPT EDU ERP — Migration 0003: self-visibility for institution membership
--
-- Why: TenantService must resolve "which institution(s) does this
-- authenticated user belong to?" BEFORE an active institution_id is known
-- (that's precisely what this lookup determines — §B.3 tenant resolution).
-- The generic tenant_isolation_select policy from 0001 requires
-- app.current_institution_id to already be set, which is circular for this
-- one lookup. This migration adds a second, narrower allowance: a user may
-- always see their OWN membership rows (matched via users.auth_user_id),
-- regardless of which institution context (if any) is currently active —
-- in addition to the existing institution-scoped visibility for admins
-- listing all members of their institution.
-- =============================================================================

drop policy if exists tenant_isolation_select on user_institution_memberships;

create policy tenant_isolation_select on user_institution_memberships
  for select using (
    institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
    or current_setting('app.is_super_admin', true) = 'true'
    or user_id in (
      select id from users
      where auth_user_id = nullif(current_setting('app.current_auth_user_id', true), '')::uuid
    )
  );
