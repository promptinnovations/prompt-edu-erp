-- =============================================================================
-- PROMPT EDU ERP — Migration 0041: Education Type (Academic / Islamic / Both).
--
-- Follow-up feature request: some institutions teach a secular ("Academic")
-- curriculum, some teach a purely Islamic curriculum, and some teach BOTH
-- side by side (confirmed live: B CareExc Science already has both kinds of
-- subjects coexisting in production). Today the app has no concept of this
-- at all -- every institution is implicitly "academic only" -- so a "both"
-- institution's subjects, exam types, portfolio and Result Analysis all
-- lump the two curricula together with no way to view them separately.
--
-- This migration adds exactly the three columns needed:
--
--   institutions.education_mode  -- which of the three modes this
--     institution is in. Drives whether the UI ever shows a track
--     selector/split at all (an 'academic'-only institution sees nothing
--     new -- this is additive, not disruptive, for the majority of
--     institutions that stay in the 'academic' default).
--
--   institutions.track_order     -- admin-configurable ordering of the two
--     tracks wherever both are shown side by side (student portfolio,
--     subject lists, exam type pickers, Result Analysis) -- "which should
--     come first will be decided by institute admin" (verbatim ask).
--     A jsonb array of the two track ids so it can be reordered from the
--     UI without a schema change.
--
--   subjects.track                -- which track a given subject belongs to.
--     Only meaningful for a 'both'-mode institution; null everywhere else
--     (an 'academic'-only or 'islamic'-only institution's subjects don't
--     need tagging -- their single mode already says what they are).
--
-- exam_types already has a free-text `category` column (added in 0037) that
-- production data and the CRUD UI's own placeholder text already use
-- informally for "Academic"/"Islamic" -- deliberately NOT adding a
-- redundant new column there; a later app-layer change constrains that
-- existing column's UI to a fixed dropdown instead of free text.
-- =============================================================================

alter table institutions
  add column education_mode text not null default 'academic'
    check (education_mode in ('academic', 'islamic', 'both')),
  add column track_order jsonb not null default '["academic", "islamic"]'::jsonb;

comment on column institutions.education_mode is
  'Which curriculum track(s) this institution teaches: academic (secular) only, islamic only, or both side by side. Drives whether subjects/exam-types/portfolio/Result Analysis ever show a track split.';
comment on column institutions.track_order is
  'Admin-configurable display order of the two tracks (e.g. ["islamic","academic"]) wherever both are shown side by side. Only meaningful when education_mode = ''both''.';

alter table subjects
  add column track text check (track in ('academic', 'islamic'));

comment on column subjects.track is
  'Which curriculum track this subject belongs to -- only meaningful (and only ever set) for a ''both''-mode institution; null for academic-only/islamic-only institutions and for any subject not yet tagged.';

-- ---------------------------------------------------------------------------
-- Backfill for the 9 institutions already in production, per explicit
-- instruction: "Malhar Arts College (Academics), Bahis Academy, Madar
-- Islamic Academy Vadanappally, B CareExc Science, badrudhuja Institute
-- (Both). All madrasa will be only Islamic." -- confirmed with the user.
-- KEMHS and YES Public School were not mentioned; left at the 'academic'
-- default, matching every other unmentioned institution.
-- ---------------------------------------------------------------------------
update institutions set education_mode = 'academic' where code = 'mact';
update institutions set education_mode = 'both' where code in ('bahis', 'madar', 'bcs', 'badrudhuja');
update institutions set education_mode = 'islamic' where type = 'madrasa';
