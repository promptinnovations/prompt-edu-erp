-- =============================================================================
-- PROMPT EDU ERP — Migration 0060: grade band performance descriptor.
--
-- §Report Card follow-up — a report card's per-subject/overall Grade letter
-- (e.g. "B+") is only meaningful to a parent if something somewhere spells
-- out what it means. §K ("never hard-code institutional scoring/
-- thresholds") already means grade_bands' labels/cutoffs/colors are fully
-- institution-defined (an "A+" here might be a "9" or "Excellent" at
-- another institution) — this is the same treatment for the one-line
-- description of what a band means ("Outstanding", "Needs Improvement",
-- etc.), editable per band in Settings > Grading alongside the rest of the
-- band, never a fixed in-app legend. Nothing seeds a value here; each
-- institution fills in its own (or leaves it blank) via the Settings UI.
-- =============================================================================

alter table grade_bands add column description text;
