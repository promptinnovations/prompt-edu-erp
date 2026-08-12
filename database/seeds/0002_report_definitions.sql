-- =============================================================================
-- PROMPT EDU ERP — Seed: built-in report_definitions (§P.2, Phase 13)
-- Platform-level (institution_id = null) seed data — every institution
-- sees the same v1 built-in report catalogue. Institution-specific custom
-- report_definitions are a future Report Builder (§59) concern, not seeded
-- here.
--
-- base_query_key maps 1:1 to a named function in
-- modules/reporting/service.ts's query registry (§P.1 "pre-defined, safe
-- query templates... never raw SQL exposed to end users" — this build's
-- templates are named TypeScript functions over the existing, already
-- permission-checked/institution-scoped service layer, not a raw-SQL
-- template string, which is at least as safe as the spec's baseline).
-- =============================================================================

insert into report_definitions (institution_id, code, name, data_source, base_query_key, columns_jsonb, default_filters_jsonb, is_system)
values
  (null, 'student_roster', 'Student Roster', 'students', 'student_roster',
   '[{"key":"admission_number","label":"Admission #"},{"key":"full_name","label":"Name"},{"key":"class_name","label":"Class"},{"key":"section_name","label":"Section"},{"key":"status","label":"Status"}]'::jsonb,
   '{}'::jsonb, true),

  (null, 'examination_results', 'Examination Results', 'examinations', 'examination_results',
   '[{"key":"student_name","label":"Student"},{"key":"total_marks","label":"Total Marks"},{"key":"max_total_marks","label":"Max Marks"},{"key":"percentage","label":"Percentage"},{"key":"grade_label","label":"Grade"},{"key":"rank","label":"Rank"}]'::jsonb,
   '{"examinationId":null}'::jsonb, true),

  (null, 'attendance_summary', 'Attendance Summary', 'attendance', 'attendance_summary',
   '[{"key":"student_name","label":"Student"},{"key":"present_days","label":"Present Days"},{"key":"total_days","label":"Total Days"},{"key":"present_percent","label":"Present %"}]'::jsonb,
   '{"classId":null,"sectionId":null,"fromDate":null,"toDate":null}'::jsonb, true),

  (null, 'consolidated_performance', 'Consolidated Performance', 'scoring', 'consolidated_performance',
   '[{"key":"student_name","label":"Student"},{"key":"period","label":"Period"},{"key":"score","label":"Score"}]'::jsonb,
   '{"period":null}'::jsonb, true),

  (null, 'library_circulation', 'Library Circulation (Currently Issued)', 'library', 'library_circulation',
   '[{"key":"book_title","label":"Book"},{"key":"student_name","label":"Student"},{"key":"due_date","label":"Due Date"},{"key":"is_overdue","label":"Overdue"}]'::jsonb,
   '{}'::jsonb, true)
on conflict (code) do nothing;
