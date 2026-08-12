-- =============================================================================
-- PROMPT EDU ERP — Migration 0014: Portal identity linking
-- ARCHITECTURE.md §D.4 (People), §Z ("(portals)/ student/parent portal route
-- groups"), Phase 12 (§AA.2).
--
-- Gap this migration closes: §D.4's `students`/`parents` table definitions
-- (as literally specified) have no `user_id` column, unlike `staff`
-- (migration 0001 already gives staff a user_id). There is therefore no way
-- for a "Student" or "Parent" system role account (both already seeded
-- since Phase 0 — see §F.3/F.4) to be resolved back to their own student/
-- parent record. Without this, a student/parent portal is unbuildable:
-- there'd be no way to answer "which student record IS this logged-in
-- user". Nullable and unique-when-set, mirroring how staff.user_id already
-- works — a student/parent doesn't get a login account until an admin
-- explicitly provisions one (modules/portal/service.ts's
-- provisionStudentPortalAccount()/provisionParentPortalAccount()).
--
-- RLS: no new policies needed — students/parents already have the standard
-- institution-isolation policies from migration 0001. The "a student may
-- only ever see THEIR OWN record, a parent only THEIR OWN children's" rule
-- is enforced in application code (modules/portal/service.ts resolves
-- user_id -> own student/parent id server-side and only ever queries that
-- specific id), the same application-layer-gate-on-top-of-RLS pattern
-- Phase 11 used for mentoring's "assigned mentor only" rule — RLS's
-- institution-isolation gate has no notion of "which specific student/
-- parent", only "which institution".
-- =============================================================================

alter table students add column user_id uuid references users(id) on delete set null;
create unique index students_user_id_unique on students(institution_id, user_id) where user_id is not null;

alter table parents add column user_id uuid references users(id) on delete set null;
create unique index parents_user_id_unique on parents(institution_id, user_id) where user_id is not null;
