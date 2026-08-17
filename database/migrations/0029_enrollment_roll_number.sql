-- PROMPT EDU ERP — roll numbers + class move/remove (§137 follow-up: "roll
-- number should be male first in alphabetic order then girls in alphabetic
-- order", plus "adding, removing, and moving from one class to another").
--
-- roll_number lives on student_enrollments (not students) because a roll
-- number is scoped to one class/section/academic-year, not a permanent
-- attribute of the student (matches how enrollment_date/status/exit_date
-- already work on this table — 0001_foundation.sql). Recomputed on demand
-- per class+section by modules/students/service.ts's assignRollNumbers(),
-- not maintained incrementally on every enroll/remove/move, so an admin can
-- always re-run it after any roster change to re-pack the sequence.
--
-- student_enrollments.status already supports arbitrary text values (no
-- check constraint was ever added — see 0001_foundation.sql) so the new
-- 'removed' and 'transferred' statuses this feature introduces need no
-- schema change beyond the new column below. Both leave the row in place
-- (§137 follow-up "removed data should be stored ... but not active
-- anywhere") — every query that matters (listStudentsForAdmin's class/
-- section join, getCurrentEnrollment, listActiveEnrollments) already
-- filters on status = 'active', so a 'removed' or 'transferred' row simply
-- stops showing up anywhere active without being deleted.

alter table student_enrollments add column roll_number integer;

comment on column student_enrollments.roll_number is
  'Per class/section/academic-year roll number, recomputed by assignRollNumbers() — males first (alphabetical), then females (alphabetical). Null until first computed.';
