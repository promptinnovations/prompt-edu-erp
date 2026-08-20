-- =============================================================================
-- PROMPT EDU ERP — Migration 0032: Academic Structure (Page 2) + Student
-- Management (Page 3) follow-ups.
--
-- classes.stage: replaces the purely presentational, numeric-guess LP/UP/HS/
-- HSS grouping that lived only in app/(institution)/classes/page.tsx's
-- phaseForClass() (broke for non-numeric class names like LKG/UKG or madrasa
-- grade names). Now a real, admin-editable field set on the class form in
-- Academic Setup; nullable free text so an institution can use its own
-- stage vocabulary, not a fixed enum.
--
-- students.photo_file_id: already existed as a bare, unconstrained uuid from
-- day one (migration 0001) — same "placeholder never wired up" pattern
-- institutions.logo_file_id had before migration 0030. This FK makes it
-- real, following that exact precedent (on delete set null: removing the
-- underlying file should never take down the student record).
--
-- idx_exam_classes_institution_class: exam_classes only had an index on
-- (institution_id, examination_id) — the Classes page's new "exams for this
-- class" list queries the reverse direction (class_id -> examinations), so
-- it needs its own index rather than reusing the existing one.
--
-- institutions.parent_portal_sections: per-institution admin control over
-- which sections of the child's page show on the parent portal (results,
-- attendance, discipline, achievements, library, skills, portfolio) — "Student
-- Portfolio Management: designing children's page, what should be shown in
-- the Parent portal" follow-up. A single jsonb column, matching the direct-
-- column precedent set by `board` (0024) and the whatsapp config (0027)
-- rather than the older generic institution_settings key/value table —
-- this is one cohesive, always-present config blob, not an open-ended list
-- of arbitrary settings. Defaults to every section visible so existing
-- institutions see no change in behavior until an admin deliberately hides
-- something.
--
-- academic.promote permission: gates the new bulk class-promotion workflow
-- (modules/academic/service.ts's promoteClass()) separately from the
-- existing settings.manage-gated Academic Setup CRUD — promoting an entire
-- class's roster to a new academic year is a high-impact, bulk data change
-- that an institution may want to restrict more tightly than ordinary
-- class/section/subject editing.
-- =============================================================================

alter table classes add column stage text;

alter table students
  add constraint students_photo_file_id_fkey
  foreign key (photo_file_id) references files(id) on delete set null;

create index idx_exam_classes_institution_class on exam_classes(institution_id, class_id);

alter table institutions
  add column parent_portal_sections jsonb not null default
    '{"results": true, "attendance": true, "discipline": true, "achievements": true, "library": true, "skills": true, "portfolio": true}'::jsonb;
