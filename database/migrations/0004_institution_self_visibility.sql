-- =============================================================================
-- PROMPT EDU ERP — Migration 0004: institution self-visibility for membership
-- resolution.
--
-- Same root cause as 0003: TenantService must be able to list "which
-- institutions does this user belong to" (joining user_institution_memberships
-- to institutions for the institution NAME/CODE) before an active
-- institution_id is known. The original institutions_select policy only
-- allowed the currently-active institution or Super Admin, which made that
-- very lookup return zero rows. This adds: an institution is also visible to
-- a user who holds an active membership row for it, regardless of which
-- institution (if any) is currently active.
-- =============================================================================

drop policy if exists institutions_select on institutions;

create policy institutions_select on institutions for select
  using (
    id = nullif(current_setting('app.current_institution_id', true), '')::uuid
    or current_setting('app.is_super_admin', true) = 'true'
    or id in (
      select m.institution_id from user_institution_memberships m
      where m.status = 'active'
        and m.user_id in (
          select id from users
          where auth_user_id = nullif(current_setting('app.current_auth_user_id', true), '')::uuid
        )
    )
  );
