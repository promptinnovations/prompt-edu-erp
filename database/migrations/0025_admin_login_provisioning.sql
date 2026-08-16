-- =============================================================================
-- PROMPT EDU ERP — Migration 0025: admin-provisioned login credentials
--
-- users_write_self (migration 0001) only lets a user update their OWN row
-- (auth_user_id = the caller's own auth_user_id, or a super admin) — fine
-- for a user editing their own profile, but modules/staff/service.ts's
-- new createStaffLoginAccount()/resetStaffLoginPassword() (§137 follow-up:
-- "mail id can be their user id and phone number as passwords... should
-- be editable anytime") need an ADMIN to set a COLLEAGUE's auth_user_id/
-- phone — exactly the gap 0012_staff.sql's own header comment already
-- flagged for a plain UPDATE ("not one an institution_admin is creating
-- on someone else's behalf"). Without this, those UPDATE statements
-- silently affect 0 rows under RLS (no error — an UPDATE whose USING
-- clause excludes every row just updates nothing), which is exactly the
-- bug this migration fixes: it was reproduced by
-- tests/integration/staff-flow.test.ts's login-provisioning tests
-- failing with has_login staying false after a "successful" call.
--
-- modules/portal/service.ts's resetStudentLoginPassword() has the exact
-- same latent gap on its own `update users set phone = ...` (its existing
-- test only asserted the call didn't throw, never that phone actually
-- changed) — fixed here too, same function, since it's the identical
-- narrow operation on the identical table.
--
-- Same SECURITY DEFINER pattern 0012_staff.sql already established for
-- user_shares_current_institution(): created by the migration-owner role
-- (exempt from RLS by Postgres design), so the function body's own query
-- bypasses users_write_self — but the function itself re-derives its own
-- authorization narrowly (target user must hold an ACTIVE membership in
-- the institution the CALLER is currently acting within,
-- app.current_institution_id, already Gate-1-validated by
-- withInstitutionContext before any service function runs) rather than
-- trusting the caller's institutionId argument blindly. This is a bypass
-- of RLS, not of the service-layer requirePermission("staff.create")
-- check every caller (createStaffLoginAction/resetStaffLoginPasswordAction)
-- already performs — the function does not re-check permissions, only
-- institution membership, matching every other service function's
-- "permission-gated by the caller, institution-scoped by RLS/this
-- function" split.
-- =============================================================================

create function set_login_credentials(
  target_user_id uuid,
  new_auth_user_id uuid, -- pass null to leave auth_user_id unchanged (the reset-password case)
  new_phone text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  updated_count integer;
begin
  if not exists (
    select 1 from user_institution_memberships uim
     where uim.user_id = target_user_id
       and uim.institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
       and uim.status = 'active'
  ) then
    return false;
  end if;

  update users
     set auth_user_id = coalesce(new_auth_user_id, auth_user_id),
         phone = new_phone,
         updated_at = now()
   where id = target_user_id;
  get diagnostics updated_count = row_count;
  return updated_count > 0;
end;
$fn$;
