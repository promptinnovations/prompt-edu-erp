-- =============================================================================
-- PROMPT EDU ERP — Migration 0036: "Teacher Profile" feature.
--
-- User-supplied template (Personal Details / Employment Details /
-- Qualifications & Skills / Responsibilities / Professional Development /
-- Achievements), a reference "Teachers Observation" PDF (a 5-domain,
-- 20-criteria classroom-observation rubric, 1-5 scored, with per-criterion
-- per-level descriptor+explanation text), and a reference exam-analysis
-- table+growth-curve screenshot.
--
-- Per the user's own explicit choices (AskUserQuestion): (1) the observation
-- rubric is admin-EDITABLE, not hard-coded — seeded as a sensible default,
-- same "institution configuration, not platform logic" principle migration
-- 0012's own header comment already established for teacher_observations'
-- criteria_jsonb; (2) observations may be recorded by Principal/management
-- (already unrestricted) AND Section Heads, but a Section Head only for
-- teachers within their own assigned stage — mirrors migration 0034's
-- attendance.view_section pattern exactly, including a distinct permission
-- code; (3) this full profile (all 6 sections + exam analysis + classroom
-- observations) is for TEACHING staff only (anyone with at least one
-- teacher_assignments row) — non-teaching staff keep the existing plain
-- staff record, so nothing here narrows what any staff member could already
-- do or see.
--
-- All new `staff` columns are nullable text/date — mandatory-ness (if any is
-- ever wanted) stays a service-layer concern, never a NOT NULL constraint,
-- same precedent students.date_of_birth/gender/photo_file_id and migration
-- 0035's Student Profile Record columns already set.
--
-- Deliberately NOT duplicated as new columns: "Classes & Subjects Handled"
-- and "Class Teacher" (both already derivable from teacher_assignments,
-- migration 0001 — a second, driftable copy would just go stale); "Joining
-- Date"/"Designation"/"Department" (already on `staff` since migration
-- 0001/0012).
-- =============================================================================

alter table staff
  add column photo_file_id           uuid,
  -- Personal Details
  add column date_of_birth           date,
  add column gender                  text,
  add column blood_group             text,
  add column contact_phone           text,
  add column address                 text,
  add column emergency_contact_name  text,
  add column emergency_contact_phone text,
  -- Employment Details (joining_date/designation/department already exist)
  add column other_roles             text,   -- e.g. "Vice Principal", "Exam Coordinator" — org-wide roles, distinct from the finer-grained Responsibilities section below
  add column previous_experience     text,
  add column documents_submitted     text,
  -- Qualifications & Skills
  add column qualifications          text,   -- academic & professional qualifications, free text (degrees/institutions/years — no fixed vocabulary the app queries against)
  add column certifications          text,
  add column specialisations         text,
  add column languages               text,
  add column skills                  text,   -- teaching / ICT-AI / other skills, one bullet in the user's own template
  -- Responsibilities (Class Teacher itself is derived from teacher_assignments)
  add column subject_coordinator_of  text,
  add column club_house_incharge     text,
  add column exam_event_duties       text,
  add column other_responsibilities  text,
  -- Professional Development
  add column trainings_workshops     text,
  add column pd_certificates         text,
  add column training_history        text,
  -- Achievements
  add column awards_recognitions     text,
  add column publications_research   text,
  add column innovations             text,
  add column other_achievements      text;

alter table staff
  add constraint staff_photo_file_id_fkey
  foreign key (photo_file_id) references files(id) on delete set null;

-- =============================================================================
-- Classroom-observation rubric — institution CONFIGURATION (§K "no
-- institutional rubric is ever hard-coded"), same principle migration 0012's
-- header comment already states for teacher_observations.criteria_jsonb.
-- Deliberately NOT seeded with data by this migration (see
-- modules/staff/service.ts's listObservationCriteria() doc comment for why:
-- it lazily provisions the PDF's 20-criteria default the first time any
-- institution's list is empty, rather than this migration embedding ~100
-- rubric-text snippets as literal SQL and needing yet another self-healing
-- backfill loop the way migration 0034 did for a much smaller, structural
-- role/permission grant).
--
-- levels_jsonb: [{score, descriptor, explanation}, ...], 5 entries, one per
-- 1-5 score, in DESCENDING score order — the array itself (not a normalized
-- child table) since these five rows are never independently queried/
-- filtered/joined against anything else in the schema, only ever rendered
-- together as one criterion's dropdown of levels (§Teacher-Profile-followup
-- "if the observer touches any of the three... the other two also appear
-- automatically" — one levels_jsonb entry supplies descriptor+score+
-- explanation together, by construction).
-- =============================================================================
create table observation_criteria (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references institutions(id) on delete cascade,
  domain           text not null,   -- e.g. "A. Planning & Preparation"
  criteria_text    text not null,   -- e.g. "1. Lesson planning and preparedness"
  sort_order       integer not null default 0,
  levels_jsonb     jsonb not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_observation_criteria_institution on observation_criteria(institution_id, sort_order);

alter table observation_criteria enable row level security;

create policy tenant_isolation_select on observation_criteria for select
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');
create policy tenant_isolation_insert on observation_criteria for insert
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');
create policy tenant_isolation_update on observation_criteria for update
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true')
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');
create policy tenant_isolation_delete on observation_criteria for delete
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');

-- Platform permission catalogue — mirrors migration 0034's
-- attendance.view_section exactly: a Section-Head-scoped sibling of the
-- already-unrestricted staff.observation.manage (held by
-- institution_admin/management), rather than widening that existing
-- permission's meaning for everyone who already holds it.
insert into permissions (code, module, description) values
  ('staff.observation.manage_section', 'staff', 'Record and view classroom observations for teachers within own assigned section(s) (Section Head)')
on conflict (code) do nothing;

-- Self-healing per-institution backfill (see migration 0034's own header
-- comment for the full rationale — same pattern, applied here to a new
-- permission instead of a new role). section_head also needs staff.view
-- to open a teacher's Profile page at all; it was never granted to that
-- role before this feature existed.
do $$
declare
  inst record;
begin
  for inst in select id from institutions loop
    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
     where r.institution_id = inst.id and r.code = 'section_head'
       and p.code in ('staff.view', 'staff.observation.manage_section')
    on conflict do nothing;
  end loop;
end $$;
