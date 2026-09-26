-- §CS.4 "don't need compute results- as mark is started entering, it
-- should start see in result analysis" -- previously a student's row in
-- `results` only appeared once EVERY exam_subject had an approved/locked
-- mark for them (computeResults()'s "skippedIncomplete" gate), and an
-- admin/management had to click a manual "Compute results" button on top
-- of that. Now computeResults() runs after every mark save (draft
-- included) and always upserts a row using whatever subjects are entered
-- so far -- these three columns let readers tell a live/partial result
-- apart from a fully finalized one.
alter table results add column subjects_entered integer not null default 0;
alter table results add column subjects_expected integer not null default 0;
alter table results add column is_provisional boolean not null default false;
