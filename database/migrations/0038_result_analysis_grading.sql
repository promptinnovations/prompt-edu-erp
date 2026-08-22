-- =============================================================================
-- PROMPT EDU ERP — Migration 0038: Result Analysis & Reporting — configurable
-- grading (per-institution PassPct + per-band hex color), curriculum presets
-- (Kerala State/SCERT, CBSE, ICSE) for the school-type "Board" onboarding
-- picker (mirrors the existing madrasa SKSVB/SKIMVB board picker), and
-- pass/fail + failed-subject-count on the computed results table.
--
-- §K "institution configuration, never hard-coded" — grade labels, band
-- colors, and the pass percentage are ALWAYS read from these rows, never
-- literals in report/chart code.
-- =============================================================================

alter table grade_bands add column color text;
alter table grade_scales add column curriculum text;
alter table institutions add column pass_pct numeric(5,2) not null default 35;
alter table results add column is_pass boolean;
alter table results add column failed_subject_count integer not null default 0;

create index idx_results_is_pass on results(institution_id, examination_id, is_pass);
