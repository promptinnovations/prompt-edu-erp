-- =============================================================================
-- PROMPT EDU ERP — Migration 0057: exam result "publish to portal" gate.
--
-- §"result should not wait for finalization ... the admin/principal should
-- publish result of an exam for viewing it in student/parent portal" —
-- results have been live-computed since migration 0054 (every mark
-- save/delete recomputes computeResults(), grade included) and the
-- Finalize/freeze feature (migration 0055's finalized_at) was a SEPARATE,
-- optional, irreversible lock — never a gate on when results become
-- visible. Neither of those controlled whether the STUDENT/PARENT PORTAL
-- shows a result; the portal has always shown whatever was computed the
-- moment it existed, with no admin control at all.
--
-- published_at/published_by add exactly that one missing control, deliberately
-- separate from finalized_at:
--   - Staff-side views (examination detail, Consolidated Marks, Report
--     Cards, Result Analysis) are UNAFFECTED — they keep showing live
--     results regardless of published_at, same as always.
--   - Only the student/parent portal's result-reading queries
--     (getStudent360()'s latestResult in modules/portfolio/service.ts,
--     listStudentResultHistory() in modules/examination/service.ts) now
--     additionally require published_at is not null.
--   - Publishing/unpublishing never touches results rows, marks, or the
--     finalized_at/is_frozen machinery — it is purely a portal-visibility
--     flag, toggle-able any number of times (unlike finalize).
-- =============================================================================

alter table examinations add column published_at timestamptz;
alter table examinations add column published_by uuid;
