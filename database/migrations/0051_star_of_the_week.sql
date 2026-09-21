-- =============================================================================
-- PROMPT EDU ERP — Migration 0051: "Star of the Week" (§9 follow-up).
--
-- One row per (institution, stage, week_start): the computed winner for
-- that stage's cohort that week. `stage` is a plain text bucket, not an
-- FK/enum — mirrors classes.stage (migration 0032's own free-text
-- vocabulary choice) — and uses '' (empty string) rather than NULL as the
-- "no stage configured" sentinel specifically so the unique constraint
-- below can actually enforce "one winner per bucket per week": Postgres
-- unique constraints never treat two NULLs as equal, so a nullable stage
-- column would silently allow unlimited institution-wide winners for the
-- same week instead of exactly one.
--
-- Computed by modules/scoring/service.ts's computeStarOfTheWeek(), which
-- reuses the existing Consolidated Score engine (computeConsolidatedScore()
-- — already blends academic, attendance, skills, achievements,
-- library/reading and discipline/character, i.e. "evaluate everything")
-- over a trailing ~30-day window, then takes the top scorer per stage.
-- Re-running for a week that already has a winner overwrites rather than
-- duplicates (ON CONFLICT), so a scheduled weekly run is safe to retry.
-- =============================================================================

create table star_of_the_week (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references institutions(id) on delete cascade,
  stage           text not null default '',
  week_start      date not null,
  student_id      uuid not null references students(id) on delete cascade,
  score           numeric(6, 2) not null,
  breakdown_jsonb jsonb,
  computed_at     timestamptz not null default now(),
  unique (institution_id, stage, week_start)
);

create index idx_star_of_the_week_institution_week on star_of_the_week(institution_id, week_start desc);

alter table star_of_the_week enable row level security;

create policy tenant_isolation_select on star_of_the_week for select
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');

create policy tenant_isolation_insert on star_of_the_week for insert
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');

create policy tenant_isolation_update on star_of_the_week for update
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true')
  with check (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
              or current_setting('app.is_super_admin', true) = 'true');

create policy tenant_isolation_delete on star_of_the_week for delete
  using (institution_id = nullif(current_setting('app.current_institution_id', true), '')::uuid
         or current_setting('app.is_super_admin', true) = 'true');
