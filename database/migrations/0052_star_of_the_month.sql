-- =============================================================================
-- PROMPT EDU ERP -- Migration 0052: rename "Star of the Week" to "Star of
-- the Month" (renamed before any real winners were ever computed in
-- production -- migration 0051 only just landed -- so this is a plain
-- rename rather than a data migration).
-- =============================================================================

alter table star_of_the_week rename to star_of_the_month;
alter table star_of_the_month rename column week_start to month_start;
alter index idx_star_of_the_week_institution_week rename to idx_star_of_the_month_institution_month;

comment on table star_of_the_month is
  'One row per (institution, stage, month_start): the computed winner for that stage''s cohort that month. See modules/scoring/service.ts computeStarOfTheMonth().';
