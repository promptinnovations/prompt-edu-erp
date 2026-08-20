-- =============================================================================
-- PROMPT EDU ERP — Migration 0035: Full "Student Profile Record" fields.
--
-- User-supplied template (personal/family/contact/academic-history/medical/
-- co-curricular sections) plus three reference screenshots: a card-grid
-- student directory (image 3), and a tabbed per-student Profile page with a
-- summary dashboard (images 1+2, Personal/Summary/Student Fees/Student
-- Portfolio/Academics tabs).
--
-- All new columns are nullable text — mandatory-at-admission is enforced at
-- the SERVICE layer (a new stricter Zod schema on the enrollment path, see
-- modules/students/service.ts), never as a NOT NULL database constraint.
-- Precedent: `students.date_of_birth`/`gender` have been nullable since
-- migration 0001 specifically because existing/imported rows may not have
-- them yet (bulk import, historic data) — a hard NOT NULL here would break
-- every existing student row the moment this migration ran. New admissions
-- go through the stricter validated path; old rows are simply incomplete
-- until an admin fills them in, exactly like `photo_file_id` already works.
--
-- Deliberately NOT duplicated here: "Class & Section" (already tracked
-- properly via student_enrollments, not a text field on students — adding
-- one would just be a second, driftable source of truth); "Date of
-- Admission" (students.created_at already means this); "Father's/Mother's
-- Name/Occupation/Contact" (the existing `parents` + `student_parents`
-- tables, migration 0001, already model this correctly — parents.occupation
-- already exists — a guardian is recorded as a `parents` row linked via
-- `student_parents.relationship = 'father'/'mother'`, not a flat column on
-- students; this avoids a second, unlinked way to store the same person).
--
-- "Sibling Details" and "Vision / Hearing Support" are free text rather than
-- normalized tables/enums — the template itself shows them as open fill-in
-- lines/checkboxes with no fixed vocabulary the app needs to query against;
-- normalizing them would be speculative structure for data nothing else in
-- the app reads programmatically.
-- =============================================================================

alter table students
  add column blood_group            text,
  add column mother_tongue          text,
  add column national_id            text,   -- Aadhaar / passport / other government ID
  add column sibling_details        text,   -- free text: "Name, Class & School" per sibling, one per line
  add column permanent_address      text,   -- only meaningfully different from `address` when it differs
  add column emergency_contact_name text,
  add column previous_school        text,
  add column highest_grade_completed text,
  add column known_allergies        text,
  add column chronic_conditions     text,
  add column regular_medications    text,
  add column vision_hearing_support text,   -- free text, e.g. "Spectacles" / "Hearing Aid" / "None"
  add column hobbies_talents        text,
  add column sports_preferences     text,
  add column clubs_interests        text;
