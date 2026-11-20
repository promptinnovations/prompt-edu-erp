-- =============================================================================
-- PROMPT EDU ERP — Migration 0069: "Scholar Teal" becomes the platform look.
--
-- §Brand-kit ("i will choose 2 Scholar Teal as the primary UI — add 1, 3,
-- 4, 5, 7, 10, 12 as options an institution can choose at their wish"):
-- services/branding/palettes.ts now holds the eight approved colour
-- directions, with "scholar-teal" as the default. This stores the same
-- platform default and returns every institution to it (null = follow the
-- default) — older stored ids belong to the previous palette list, which
-- no longer exists. Each institution can then pick its own colours again
-- under Settings → Appearance. Idempotent.
-- =============================================================================

update platform_settings
   set value = 'scholar-teal', updated_at = now()
 where key = 'default_theme_palette';

insert into platform_settings (key, value)
select 'default_theme_palette', 'scholar-teal'
 where not exists (select 1 from platform_settings where key = 'default_theme_palette');

update institutions set theme_palette = null, updated_at = now()
 where theme_palette is not null;
