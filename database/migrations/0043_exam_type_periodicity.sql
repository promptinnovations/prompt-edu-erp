-- =============================================================================
-- PROMPT EDU ERP — Migration 0043: Exam type periodicity (task #418).
--
-- User's own words: "institution should be able to enter the type of
-- examination, it will be like periodic, cyclic, term, monthly etc."
--
-- One new free-text column on exam_types, alongside the existing free-text
-- `category` (Academic/Islamic, migration 0037) — same "never a hard-coded
-- institutional value" principle (§K): an institution can label its own
-- exam types Periodic/Cyclic/Term/Monthly/Weekly/Half-yearly/Annual/
-- whatever it actually calls them; the app only ever offers common
-- suggestions (via a <datalist> in the UI), never a fixed enum.
-- =============================================================================

alter table exam_types
  add column periodicity text; -- free text, e.g. "Periodic", "Cyclic", "Term", "Monthly" — institution's own labeling, optional

comment on column exam_types.periodicity is
  'How often this exam type recurs, in the institution''s own words (e.g. Periodic, Cyclic, Term, Monthly, Weekly, Annual) -- optional free text, never a hard-coded enum.';
