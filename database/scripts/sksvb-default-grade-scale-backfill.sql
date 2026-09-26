-- =============================================================================
-- ONE-OFF DATA BACKFILL — default grade scale for SKSVB-board institutions.
-- NOT a migration: run manually (Supabase SQL editor), ONCE.
--
-- Root cause (§Analytics follow-up "why grade circle is not active?"):
-- provisionSksvbDefaults() (services/super-admin/super-admin-service.ts)
-- seeds classes/subjects for a new SKSVB institution but never seeded a
-- grade_scales/grade_bands row the way provisionGradingPreset() does for
-- kerala_state/cbse/icse boards. Confirmed in production: every sksvb-board
-- institution (mmp, mbs) has ZERO grade_scales rows. Result Analysis's
-- "Grade distribution" donut is driven by an INNER JOIN against
-- grade_bands (getGradeDistribution() in modules/analytics/service.ts), so
-- with no grade_scale_id on the exam and no grade_bands to match, the
-- donut renders empty even though the exam has real computed results.
-- computeResultsScoped() (modules/examination/service.ts) also silently
-- wrote grade_band_id/grade_label/grade_color = null on every result row
-- for these exams, since resolveGradeBand([], pct) always returns null.
--
-- Code fix (already committed, this script does NOT depend on it running
-- first): provisionSksvbDefaults()'s call sites (createInstitution(),
-- updateInstitutionBoard()) now also provision a default grade scale for
-- 'sksvb' — so this gap won't recur for institutions created from now on.
-- This script is the one-time catch-up for the two SKSVB institutions that
-- already exist and predate that fix.
--
-- What it does:
--   1. For every institution with board='sksvb' and ZERO grade_scales
--      rows, seeds one default scale (reusing the Kerala State 9-band
--      shape/colors/pass-% — same values services/super-admin/
--      super-admin-service.ts's SKSVB_PRESET now uses) and sets
--      institutions.pass_pct = 35.
--   2. Points MMP's "HALF YEARLY EXAM" (the one exam that already has
--      results) at the new scale, ONLY if it currently has none set.
--   3. Backfills grade_band_id/grade_label/grade_color on that exam's
--      already-computed results, using the exact same rule
--      resolveGradeBand() uses (highest min_percent <= rounded
--      percentage) — no marks, totals, pass/fail, or any other results
--      column is touched.
--
-- Fully editable afterward via the existing grade scale/grade band CRUD
-- (Settings -> Grading) exactly like a hand-built scale — this is just a
-- reasonable starting point, not a permanent SKSVB standard.
-- =============================================================================

-- ---- 1. DRY RUN (read-only): confirm the two institutions this affects ------
select i.code, i.name, i.board,
       (select count(*) from grade_scales gs where gs.institution_id = i.id) as existing_scales,
       (select count(*) from examinations e where e.institution_id = i.id) as exams
  from institutions i
 where i.board = 'sksvb'
 order by i.code;
-- expect: mmp and mbs, existing_scales = 0 for both, mmp exams = 1

select e.id, e.name, e.grade_scale_id, count(r.id) as result_count
  from examinations e
  left join results r on r.examination_id = e.id
 where e.institution_id = (select id from institutions where code = 'mmp')
 group by e.id, e.name, e.grade_scale_id;
-- expect: HALF YEARLY EXAM, grade_scale_id = null, result_count = 9

-- ---- 2. APPLY ----------------------------------------------------------------
begin;

do $$
declare
  inst record;
  new_scale_id uuid;
  bands jsonb := '[
    {"label":"A+","min":90,"max":100,"point":9,"color":"#16a34a"},
    {"label":"A","min":80,"max":89.99,"point":8,"color":"#4ea23a"},
    {"label":"B+","min":70,"max":79.99,"point":7,"color":"#86a12b"},
    {"label":"B","min":60,"max":69.99,"point":6,"color":"#bd9f1b"},
    {"label":"C+","min":50,"max":59.99,"point":5,"color":"#f59e0b"},
    {"label":"C","min":40,"max":49.99,"point":4,"color":"#ef8012"},
    {"label":"D+","min":30,"max":39.99,"point":3,"color":"#e96219"},
    {"label":"D","min":20,"max":29.99,"point":2,"color":"#e2441f"},
    {"label":"E","min":0,"max":19.99,"point":1,"color":"#dc2626"}
  ]'::jsonb;
  b jsonb;
  mmp_exam constant uuid := '8427ae2d-210d-4175-ac4e-e787cb245251';
  v_ok boolean;
begin
  select exists (
    select 1 from examinations e join institutions i on i.id = e.institution_id
     where e.id = mmp_exam and i.code = 'mmp' and upper(e.name) = 'HALF YEARLY EXAM'
  ) into v_ok;
  if not v_ok then raise exception 'Guard failed: % is not MMP''s HALF YEARLY EXAM', mmp_exam; end if;

  for inst in select id, code from institutions where board = 'sksvb' loop
    if exists (select 1 from grade_scales where institution_id = inst.id) then
      raise notice 'Skipping %: already has a grade_scales row', inst.code;
      continue;
    end if;

    insert into grade_scales (institution_id, name, is_default, curriculum)
    values (inst.id, 'SKSVB 9-point (default)', true, 'SKSVB')
    returning id into new_scale_id;

    for b in select * from jsonb_array_elements(bands) loop
      insert into grade_bands (institution_id, grade_scale_id, min_percent, max_percent, grade_label, grade_point, color)
      values (inst.id, new_scale_id, (b->>'min')::numeric, (b->>'max')::numeric, b->>'label', (b->>'point')::int, b->>'color');
    end loop;

    update institutions set pass_pct = 35, updated_at = now() where id = inst.id;
    raise notice 'Provisioned default grade scale for %: %', inst.code, new_scale_id;

    if inst.code = 'mmp' then
      update examinations set grade_scale_id = new_scale_id
       where id = mmp_exam and grade_scale_id is null;

      update results r
         set grade_band_id = picked.id, grade_label = picked.grade_label, grade_color = picked.color
        from (
          select distinct on (r2.id) r2.id as result_id, gb.id, gb.grade_label, gb.color
            from results r2
            join grade_bands gb on gb.grade_scale_id = new_scale_id
           where r2.examination_id = mmp_exam
             and r2.percentage is not null
             and gb.min_percent <= round(r2.percentage::numeric, 2)
           order by r2.id, gb.min_percent desc
        ) picked
       where r.id = picked.result_id;
      raise notice 'Backfilled grade bands on MMP Half Yearly Exam results';
    end if;
  end loop;
end $$;

-- Final state (whole APPLY block is one transaction: any exception above
-- aborts it and nothing is changed):
select gb.grade_label, count(r.id) as students
  from results r
  join grade_bands gb on gb.id = r.grade_band_id
 where r.examination_id = '8427ae2d-210d-4175-ac4e-e787cb245251'
 group by gb.grade_label, gb.min_percent
 order by gb.min_percent desc;

commit;
