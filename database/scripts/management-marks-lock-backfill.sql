-- =============================================================================
-- ONE-OFF DATA BACKFILL — grant 'marks.lock' to every institution's
-- 'management' (Principal) role that is missing it.
-- NOT a migration: run manually (Supabase SQL editor), ONCE.
--
-- Root cause (§"there should be an option for editing marks even after
-- submission with the permission of principal"): correctMark() and its
-- server action correctMarkAction() already existed, and the marks-entry
-- grid already showed a "Correct" link for any non-draft mark (submitted/
-- verified/approved/locked) whenever the viewer has the marks.lock
-- permission — correctMarkAction() checks marks.lock specifically, on
-- purpose ("only whoever can lock marks in the first place may reopen
-- one"). But the 'management' role's default grant list in
-- database/scripts/seed.ts never included marks.lock, only marks.approve —
-- so a Principal using the default role saw no "Correct" option at all once
-- a mark left draft status, even though the feature was fully built and
-- wired in. seed.ts has now been updated to include marks.lock for new
-- institutions; this script is the catch-up for institutions already
-- provisioned before that change (createInstitution() only runs seed.ts's
-- role grants ONCE, at creation time — same staleness pattern already seen
-- and fixed for reports.view/teacher, see
-- database/scripts/teacher-reports-view-backfill.sql).
--
-- What it does:
--   For every role with code = 'management', insert a role_permissions row
--   linking it to the 'marks.lock' permission, unless that link already
--   exists. Nothing else is touched — no other role, no other permission.
-- =============================================================================

-- ---- 1. DRY RUN (read-only): which institutions/management roles are missing it ----
select i.code, i.name, r.id as management_role_id
  from roles r
  join institutions i on i.id = r.institution_id
  join permissions p on p.code = 'marks.lock'
 where r.code = 'management'
   and not exists (
     select 1 from role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id
   )
 order by i.code;
-- expect: every institution whose management role was provisioned before
-- this fix; any institution already up to date simply won't appear.

-- ---- 2. APPLY ------------------------------------------------------------------
begin;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
  from roles r
  join permissions p on p.code = 'marks.lock'
 where r.code = 'management'
on conflict do nothing;

-- Final state: re-run the dry-run SELECT above — it should now return zero
-- rows (every institution's management role has the grant).
select i.code, i.name, r.id as management_role_id
  from roles r
  join institutions i on i.id = r.institution_id
  join permissions p on p.code = 'marks.lock'
 where r.code = 'management'
   and not exists (
     select 1 from role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id
   );
-- expect: 0 rows

commit;
