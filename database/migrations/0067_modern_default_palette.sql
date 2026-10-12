-- =============================================================================
-- PROMPT EDU ERP — Migration 0067: the "Modern Indigo" look becomes the
-- platform default.
--
-- §Modern-palettes ("change the colour of the website — use the best of
-- modern web apps"): services/branding/palettes.ts gains three modern
-- palettes (Modern Indigo, Modern Teal, Midnight Blue) that also carry a
-- full colour system (cool neutrals, brand steps, shadow tint), and the
-- code default becomes "modern-indigo". This migration makes the stored
-- platform default match, and returns every institution to "follow the
-- platform default" (null), so the new look shows everywhere at once.
--
-- Nothing is lost: an institution can pick any palette again — including
-- its old one — under Settings → Appearance, and the Super Admin can
-- change the platform default under Appearance. Idempotent.
-- =============================================================================

update platform_settings
   set value = 'modern-indigo', updated_at = now()
 where key = 'default_theme_palette';

insert into platform_settings (key, value)
select 'default_theme_palette', 'modern-indigo'
 where not exists (select 1 from platform_settings where key = 'default_theme_palette');

update institutions set theme_palette = null, updated_at = now()
 where theme_palette is not null;
