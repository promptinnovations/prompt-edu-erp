-- =============================================================================
-- PROMPT EDU ERP — Migration 0042: Staff self-mark attendance + principal
-- approval (task #415).
--
-- User's own words: "Daily attendance of staff; 2 ways should be enabled,
-- each staff mark own attendance and principal approve it, or principal
-- himself mark staff attendance."
--
-- One new column, approval_status. Every existing/admin-entered row
-- defaults to 'approved' — this is a pure additive change, nothing that
-- already relies on staff_attendance rows being "final" breaks. Two write
-- paths now share the same table:
--   1. markStaffAttendance() (principal/admin bulk grid submit, already
--      existing, attendance.enter) — always writes approval_status =
--      'approved'. Since the grid resubmits every visible row on Save,
--      clicking Save is ALSO how a principal approves any pending
--      self-marked rows already sitting in the grid — no separate approve
--      endpoint needed, same upsert/conflict-target as before.
--   2. markOwnStaffAttendance() (new, modules/staff/service.ts) — a staff
--      member marking their own single day (today only) writes
--      approval_status = 'pending', marked_by = self.
--
-- No new permission code: deliberately mirrors the existing staff
-- self-service leave precedent (applyForOwnLeaveAction,
-- app/(institution)/attendance/actions.ts — see its own header comment,
-- "Deliberately requires NO attendance.* permission") — any user with a
-- linked staff row (resolved server-side via getOwnStaffId(), never a
-- client-supplied id) can mark their own attendance, gated purely by
-- having that staff row, not by a role_permissions grant. Kept consistent
-- rather than inventing a second, differently-shaped self-service gate.
-- =============================================================================

alter table staff_attendance
  add column approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved'));
