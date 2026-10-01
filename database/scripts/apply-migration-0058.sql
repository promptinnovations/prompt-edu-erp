-- =============================================================================
-- HAND-OFF — apply migration 0058 to production (Supabase SQL Editor).
-- The automated apply_migration/execute_sql tools are disconnected for this
-- session, so this is the same content as
-- database/migrations/0058_marks_closed_status.sql, to run manually ONCE.
--
-- §"stop principal's approval and lock part - admin will switch mark entry
-- Open> Closed> Published> Archived, that is enough" — adds the two columns
-- the new examination-level status needs. Published/Archived reuse the
-- already-live published_at/finalized_at columns from earlier migrations —
-- nothing else to add for those.
-- =============================================================================

alter table examinations add column if not exists marks_closed_at timestamptz;
alter table examinations add column if not exists marks_closed_by uuid;

-- Verify:
select column_name from information_schema.columns
 where table_name = 'examinations' and column_name in ('marks_closed_at', 'marks_closed_by');
-- expect: both rows present
