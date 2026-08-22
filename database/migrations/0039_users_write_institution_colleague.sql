-- =============================================================================
-- PROMPT EDU ERP — Migration 0039: allow editing a colleague's users.full_name
-- (Staff "Edit details" follow-up)
--
-- migration 0012 added users_select_institution_colleague (SELECT) so the
-- staff directory could list OTHER users' names within the same
-- institution, reusing the user_shares_current_institution() SECURITY
-- DEFINER helper it defined to dodge the RLS-on-RLS recursion between
-- `users` and `user_institution_memberships`.
--
-- The Staff "Edit details" feature (modules/staff/service.ts's
-- updateStaffMember(), extended to also update users.full_name for the
-- edited staff member) needs the equivalent UPDATE policy: without it,
-- users_write_self (migration 0001) only lets a session update its OWN
-- row, so an admin editing a *different* staff member's name silently
-- updates 0 rows under RLS even though the app layer already gated the
-- call behind the "staff.edit" permission (requirePermission() in
-- app/(institution)/staff/actions.ts's updateStaffAction) -- same posture
-- as the SELECT colleague policy: RLS enforces tenant/institution
-- isolation (Gate 2), the permission-service enforces the finer-grained
-- "can this role edit staff" check (Gate outside RLS's remit), same as
-- every other §E two-gate table in this codebase.
-- =============================================================================

create policy users_write_institution_colleague on users for update
  using (user_shares_current_institution(id))
  with check (user_shares_current_institution(id));
