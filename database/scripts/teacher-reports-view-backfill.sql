-- =============================================================================
-- ONE-OFF DATA BACKFILL — grant 'reports.view' to every institution's
-- 'teacher' role that is missing it.
-- NOT a migration: run manually (Supabase SQL editor), ONCE.
--
-- Root cause (img4 "for a teacher, give access to the result analysis of
-- the classes they are assigned"): the Result Analysis page (/analytics)
-- has always been permission-gated on reports.view, and the teacher role's
-- OWN scoping logic (getTeacherClassScope() in
-- services/scope/teacher-scope-service.ts) already correctly narrows what a
-- teacher sees there to their own assigned classes/subjects once they're
-- past that gate — that part of the code needed no fix.
--
-- The actual gap is stale seed data: database/scripts/seed.ts's teacher
-- roleGrants list added "reports.view" at some point after several
-- institutions were already provisioned (createInstitution() only runs
-- seed.ts's role grants ONCE, at creation time — it is never re-run
-- against an existing institution when the code's own default grant list
-- changes later). Confirmed live via read-only SQL against production: MMP's
-- teacher role's actual permission grants match the CURRENT seed.ts list
-- for every other permission except this one — proving this is exactly a
-- "created before the code added this grant" gap, the same pattern already
-- fixed once before for a different permission set (see task #212 in the
-- project history). This script is the general-purpose catch-up: it grants
-- reports.view to EVERY institution's teacher role that doesn't already
-- have it, not just MMP, since the same staleness can affect any
-- institution created before this line existed in seed.ts.
--
-- What it does:
--   For every role with code = 'teacher', insert a role_permissions row
--   linking it to the 'reports.view' permission, unless that link already
--   exists. Nothing else is touched — no other role, no other permission.
-- =============================================================================

-- ---- 1. DRY RUN (read-only): which institutions/teacher roles are missing it ----
select i.code, i.name, r.id as teacher_role_id
  from roles r
  join institutions i on i.id = r.institution_id
  join permissions p on p.code = 'reports.view'
 where r.code = 'teacher'
   and not exists (
     select 1 from role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id
   )
 order by i.code;
-- expect: at least MMP in this list; any institution already up to date
-- (created after seed.ts added this grant) simply won't appear.

-- ---- 2. APPLY ------------------------------------------------------------------
begin;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
  from roles r
  join permissions p on p.code = 'reports.view'
 where r.code = 'teacher'
on conflict do nothing;

-- Final state: re-run the dry-run SELECT above — it should now return zero
-- rows (every institution's teacher role has the grant).
select i.code, i.name, r.id as teacher_role_id
  from roles r
  join institutions i on i.id = r.institution_id
  join permissions p on p.code = 'reports.view'
 where r.code = 'teacher'
   and not exists (
     select 1 from role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id
   );
-- expect: 0 rows

commit;
