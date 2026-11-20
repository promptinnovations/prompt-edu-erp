/**
 * PROMPT EDU ERP — curated colour-combination catalogue.
 *
 * Follow-up ("all institutions' login interface ... never use dark ...
 * give colour combination options, let them choose best for them, even in
 * Super Admin's console"): the previous design (globals.css's old
 * `:root`/`.dark` pair, task #156/157) fixed ONE palette for the whole
 * product and offered a light/dark toggle instead of colour choice. That's
 * replaced by this: a small, fixed set of hand-picked, LIGHT-ONLY palettes
 * (no institution or Super Admin can pick "dark" — it no longer exists as
 * an option), each a complete, pre-matched set of the CSS custom
 * properties globals.css's `:root` block already defines. An institution
 * (services/institution/institution-service.ts's updateInstitutionTheme())
 * or the platform default (services/super-admin/super-admin-service.ts's
 * setPlatformDefaultPalette(), used for the Super Admin console itself and
 * the generic /login with no institution context) picks one of these BY
 * ID — never a raw hex value — so every combination on screen is always
 * one this list's author actually chose and checked for contrast, not an
 * arbitrary user-picked hex that might clash or fail contrast.
 *
 * Deliberately no pure black / near-black anywhere in this file (not
 * `#000000`, not zinc-900-style `#18181b`) — a direct follow-up to "never
 * use app icon in black", generalised to the whole palette set. Every
 * "dark" tone below (the sidebar rail colours) is a real, saturated hue
 * at a dark lightness, not a desaturated near-black.
 */

export interface ThemePalette {
  id: string;
  /** Shown in the picker UI. */
  label: string;
  /** Three swatch hexes for a compact preview chip in the picker UI. */
  swatch: [string, string, string];
  vars: {
    background: string;
    foreground: string;
    /** Page/section heading colour. Optional — falls back to `foreground`. */
    heading?: string;
    surface: string;
    surfaceMuted: string;
    borderSubtle: string;
    brand: string;
    brandHover: string;
    brandFrom: string;
    brandVia: string;
    brandTo: string;
    accentTeal: string;
    accentTealHover: string;
    sidebarBg: string;
    sidebarBg2: string;
    sidebarActive: string;
    sidebarBorder: string;
    sidebarText: string;
    sidebarTextMuted: string;
    sidebarIcon: string;
    /** Brand name and other strong text on the sidebar. Optional —
     *  white (the dark-rail palettes) when omitted. */
    sidebarStrong?: string;
    /** Text of the active nav item. Optional — white when omitted. */
    sidebarActiveText?: string;
  };
  /** §Modern-palettes — optional full colour system. When present it
   *  re-points the Tailwind families the whole app is written in (zinc
   *  neutrals + text tones, indigo/primary brand steps, card shadows) at
   *  this palette, so every page follows it, not just the shell. Palettes
   *  without it keep the original warm-sand neutrals and navy steps
   *  (globals.css fallbacks), exactly as before. */
  system?: PaletteSystem;
}

type Steps = "50" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900" | "950";
export interface PaletteSystem {
  /** Brand scale, 50 (lightest) → 950. 600+ carries white text. */
  brand: Record<Steps, string>;
  /** Neutral fills/borders: 50 lifted surface, 100 ground, 200 subtle
   *  fill, 300 border, 400 heavy divider. */
  neutral: Record<"50" | "100" | "200" | "300" | "400", string>;
  /** Text tones: muted (captions, ≥4.5:1 on white), body, ink (headings). */
  text: { muted: string; body: string; ink: string };
  /** "r, g, b" of the shadow tint. */
  shadowRgb: string;
}

// §Brand-kit ("i will choose 2 Scholar Teal as the primary UI — add 1, 3,
// 4, 5, 7, 10, 12 as options an institution can choose at their wish"):
// the eight colour directions approved from the brand kit PDF. Scholar
// Teal is the default for every institution, the login screen and the
// Super Admin console; an institution can switch to any of the others
// under Settings → Appearance. Each one carries a full colour system, so
// the whole app (not only the shell) follows it, and every text pair is
// WCAG AA (white on brand / accent, sidebar text, active nav, captions).
// Generated from the brand-kit tokens — keep the two in step.
export const THEME_PALETTES: ThemePalette[] = [
  {
    // Brand kit option 02.
    id: "scholar-teal",
    label: "Scholar Teal",
    swatch: ["#ffffff", "#0f766e", "#f97316"],
    vars: { background: "#f4f8f7", foreground: "#172033", heading: "#172033", surface: "#ffffff", surfaceMuted: "#fafcfb", borderSubtle: "#dee2e3", brand: "#0f766e", brandHover: "#0e6460", brandFrom: "#0f766e", brandVia: "#0e6460", brandTo: "#0e5353", accentTeal: "#c2410c", accentTealHover: "#a13810", sidebarBg: "#ffffff", sidebarBg2: "#ffffff", sidebarActive: "#f1f7f6", sidebarBorder: "#dee2e3", sidebarText: "#3a4152", sidebarTextMuted: "#646a76", sidebarIcon: "#646a76", sidebarStrong: "#172033", sidebarActiveText: "#0e6460" },
    system: {
      brand: { "50": "#f1f7f6", "100": "#e0edec", "200": "#c1dbd9", "300": "#95c3bf", "400": "#65a7a2", "500": "#358c85", "600": "#0f766e", "700": "#0e6460", "800": "#0e5353", "900": "#0d4549", "950": "#0c353c" },
      neutral: { "50": "#fafcfb", "100": "#f4f8f7", "200": "#e7ebeb", "300": "#dee2e3", "400": "#a4aab0" },
      text: { muted: "#646a76", body: "#4a5160", ink: "#172033" },
      shadowRgb: "21, 54, 66",
    },
  },
  {
    // Brand kit option 01.
    id: "royal-indigo",
    label: "Royal Indigo",
    swatch: ["#ffffff", "#4f46e5", "#f59e0b"],
    vars: { background: "#f6f7fb", foreground: "#172033", heading: "#172033", surface: "#ffffff", surfaceMuted: "#fafbfd", borderSubtle: "#e0e2e7", brand: "#4f46e5", brandHover: "#433cc2", brandFrom: "#4f46e5", brandVia: "#433cc2", brandTo: "#3834a2", accentTeal: "#b45309", accentTealHover: "#96470d", sidebarBg: "#ffffff", sidebarBg2: "#ffffff", sidebarActive: "#f4f4fd", sidebarBorder: "#e0e2e7", sidebarText: "#3a4152", sidebarTextMuted: "#646a76", sidebarIcon: "#646a76", sidebarStrong: "#172033", sidebarActiveText: "#433cc2" },
    system: {
      brand: { "50": "#f4f4fd", "100": "#e8e7fc", "200": "#d1cff8", "300": "#b2aef4", "400": "#8e89ee", "500": "#6b64e9", "600": "#4f46e5", "700": "#433cc2", "800": "#3834a2", "900": "#2e2c86", "950": "#232367" },
      neutral: { "50": "#fafbfd", "100": "#f6f7fb", "200": "#e9eaef", "300": "#e0e2e7", "400": "#a6aab3" },
      text: { muted: "#646a76", body: "#4a5160", ink: "#172033" },
      shadowRgb: "37, 42, 96",
    },
  },
  {
    // Brand kit option 03.
    id: "navy-gold",
    label: "Navy & Gold Heritage",
    swatch: ["#0b1f3a", "#1d3a6e", "#c8a84b"],
    vars: { background: "#f7f5f0", foreground: "#172033", heading: "#172033", surface: "#ffffff", surfaceMuted: "#fbfaf8", borderSubtle: "#e1e0dd", brand: "#1d3a6e", brandHover: "#1a3260", brandFrom: "#1d3a6e", brandVia: "#1a3260", brandTo: "#172c53", accentTeal: "#7a6420", accentTealHover: "#665520", sidebarBg: "#0b1f3a", sidebarBg2: "#0e2443", sidebarActive: "#2d3e56", sidebarBorder: "#23354e", sidebarText: "#e8ecf6", sidebarTextMuted: "#a2aab4", sidebarIcon: "#bbc0c8", sidebarStrong: "#ffffff", sidebarActiveText: "#ffffff" },
    system: {
      brand: { "50": "#f1f3f6", "100": "#e2e5ec", "200": "#c4ccd9", "300": "#9ca8bf", "400": "#6e81a2", "500": "#415a85", "600": "#1d3a6e", "700": "#1a3260", "800": "#172c53", "900": "#142649", "950": "#111f3c" },
      neutral: { "50": "#fbfaf8", "100": "#f7f5f0", "200": "#eae8e5", "300": "#e1e0dd", "400": "#a6a8ac" },
      text: { muted: "#646a76", body: "#4a5160", ink: "#172033" },
      shadowRgb: "24, 38, 66",
    },
  },
  {
    // Brand kit option 04.
    id: "emerald-madrasa",
    label: "Emerald Madrasa",
    swatch: ["#053b2e", "#047857", "#d4a017"],
    vars: { background: "#f4f7f3", foreground: "#172033", heading: "#172033", surface: "#ffffff", surfaceMuted: "#fafbf9", borderSubtle: "#dee2e0", brand: "#047857", brandHover: "#05654d", brandFrom: "#047857", brandVia: "#05654d", brandTo: "#065544", accentTeal: "#7c5e06", accentTealHover: "#68500b", sidebarBg: "#053b2e", sidebarBg2: "#054635", sidebarActive: "#28564b", sidebarBorder: "#1e4f43", sidebarText: "#e8ecf6", sidebarTextMuted: "#a0b5b0", sidebarIcon: "#b9c8c4", sidebarStrong: "#ffffff", sidebarActiveText: "#ffffff" },
    system: {
      brand: { "50": "#f0f7f5", "100": "#deede9", "200": "#bedcd3", "300": "#91c4b5", "400": "#5ea993", "500": "#2c8e72", "600": "#047857", "700": "#05654d", "800": "#065544", "900": "#07463d", "950": "#083534" },
      neutral: { "50": "#fafbf9", "100": "#f4f7f3", "200": "#e7eae7", "300": "#dee2e0", "400": "#a4aaae" },
      text: { muted: "#646a76", body: "#4a5160", ink: "#172033" },
      shadowRgb: "18, 54, 60",
    },
  },
  {
    // Brand kit option 05.
    id: "ocean-blue",
    label: "Ocean Blue",
    swatch: ["#ffffff", "#0369a1", "#f97316"],
    vars: { background: "#f6f7fb", foreground: "#172033", heading: "#172033", surface: "#ffffff", surfaceMuted: "#fafbfd", borderSubtle: "#e0e2e7", brand: "#0369a1", brandHover: "#04598a", brandFrom: "#0369a1", brandVia: "#04598a", brandTo: "#064b75", accentTeal: "#c2410c", accentTealHover: "#a13810", sidebarBg: "#ffffff", sidebarBg2: "#ffffff", sidebarActive: "#f0f6f9", sidebarBorder: "#e0e2e7", sidebarText: "#3a4152", sidebarTextMuted: "#646a76", sidebarIcon: "#646a76", sidebarStrong: "#172033", sidebarActiveText: "#04598a" },
    system: {
      brand: { "50": "#f0f6f9", "100": "#deecf3", "200": "#bdd8e7", "300": "#90bdd6", "400": "#5e9fc3", "500": "#2b81b0", "600": "#0369a1", "700": "#04598a", "800": "#064b75", "900": "#073e63", "950": "#08304e" },
      neutral: { "50": "#fafbfd", "100": "#f6f7fb", "200": "#e9eaef", "300": "#e0e2e7", "400": "#a6aab3" },
      text: { muted: "#646a76", body: "#4a5160", ink: "#172033" },
      shadowRgb: "18, 50, 78",
    },
  },
  {
    // Brand kit option 07.
    id: "slate-lime",
    label: "Slate & Lime",
    swatch: ["#ffffff", "#334155", "#65a30d"],
    vars: { background: "#f5f6f8", foreground: "#172033", heading: "#172033", surface: "#ffffff", surfaceMuted: "#fafafc", borderSubtle: "#dfe1e4", brand: "#334155", brandHover: "#2c384b", brandFrom: "#334155", brandVia: "#2c384b", brandTo: "#253043", accentTeal: "#4d7c0f", accentTealHover: "#416912", sidebarBg: "#ffffff", sidebarBg2: "#ffffff", sidebarActive: "#f3f4f5", sidebarBorder: "#dfe1e4", sidebarText: "#3a4152", sidebarTextMuted: "#646a76", sidebarIcon: "#646a76", sidebarStrong: "#172033", sidebarActiveText: "#2c384b" },
    system: {
      brand: { "50": "#f3f4f5", "100": "#e4e6e9", "200": "#caced3", "300": "#a5abb4", "400": "#7c8592", "500": "#545f70", "600": "#334155", "700": "#2c384b", "800": "#253043", "900": "#20293c", "950": "#192233" },
      neutral: { "50": "#fafafc", "100": "#f5f6f8", "200": "#e8e9ec", "300": "#dfe1e4", "400": "#a5a9b1" },
      text: { muted: "#646a76", body: "#4a5160", ink: "#172033" },
      shadowRgb: "30, 40, 60",
    },
  },
  {
    // Brand kit option 10.
    id: "forest-sand",
    label: "Forest & Sand",
    swatch: ["#ffffff", "#166534", "#a16207"],
    vars: { background: "#f7f3ea", foreground: "#172033", heading: "#172033", surface: "#ffffff", surfaceMuted: "#fbf9f4", borderSubtle: "#e1ded8", brand: "#166534", brandHover: "#145630", brandFrom: "#166534", brandVia: "#145630", brandTo: "#12482d", accentTeal: "#a16207", accentTealHover: "#86530c", sidebarBg: "#ffffff", sidebarBg2: "#ffffff", sidebarActive: "#f1f6f3", sidebarBorder: "#e1ded8", sidebarText: "#3a4152", sidebarTextMuted: "#646a76", sidebarIcon: "#646a76", sidebarStrong: "#172033", sidebarActiveText: "#145630" },
    system: {
      brand: { "50": "#f1f6f3", "100": "#e1ebe5", "200": "#c2d7ca", "300": "#98bba6", "400": "#6a9c7d", "500": "#3b7e54", "600": "#166534", "700": "#145630", "800": "#12482d", "900": "#113c2a", "950": "#0f2f27" },
      neutral: { "50": "#fbf9f4", "100": "#f7f3ea", "200": "#eae6df", "300": "#e1ded8", "400": "#a6a7a8" },
      text: { muted: "#646a76", body: "#4a5160", ink: "#172033" },
      shadowRgb: "23, 49, 51",
    },
  },
  {
    // Brand kit option 12.
    id: "aqua-fresh",
    label: "Aqua Fresh",
    swatch: ["#ffffff", "#0e7490", "#84cc16"],
    vars: { background: "#f3f8fa", foreground: "#172033", heading: "#172033", surface: "#ffffff", surfaceMuted: "#f9fcfc", borderSubtle: "#dde2e6", brand: "#0e7490", brandHover: "#0d627c", brandFrom: "#0e7490", brandVia: "#0d627c", brandTo: "#0d526a", accentTeal: "#4d7c0f", accentTealHover: "#416912", sidebarBg: "#ffffff", sidebarBg2: "#ffffff", sidebarActive: "#f1f7f8", sidebarBorder: "#dde2e6", sidebarText: "#3a4152", sidebarTextMuted: "#646a76", sidebarIcon: "#646a76", sidebarStrong: "#172033", sidebarActiveText: "#0d627c" },
    system: {
      brand: { "50": "#f1f7f8", "100": "#e0edf1", "200": "#c0dbe2", "300": "#95c2ce", "400": "#65a6b8", "500": "#358aa2", "600": "#0e7490", "700": "#0d627c", "800": "#0d526a", "900": "#0d445a", "950": "#0c3448" },
      neutral: { "50": "#f9fcfc", "100": "#f3f8fa", "200": "#e6ebee", "300": "#dde2e6", "400": "#a4aab2" },
      text: { muted: "#646a76", body: "#4a5160", ink: "#172033" },
      shadowRgb: "21, 53, 74",
    },
  },
];

// The default look (migration 0069 stores the same value as the platform
// default and returns every institution to it).
export const DEFAULT_PALETTE_ID = "scholar-teal";
export const PALETTE_IDS = THEME_PALETTES.map((p) => p.id);

export function getPalette(id: string | null | undefined): ThemePalette {
  return THEME_PALETTES.find((p) => p.id === id) ?? THEME_PALETTES.find((p) => p.id === DEFAULT_PALETTE_ID)!;
}

/** The platform look — Scholar Teal — used wherever no institution is in
 *  context (generic login, Super Admin console, generic install icon). */
export const APP_PALETTE: ThemePalette = getPalette(DEFAULT_PALETTE_ID);

/** §Brand-kit: an institution's own choice (institutions.theme_palette,
 *  set under Settings → Appearance), or the default when it hasn't chosen
 *  one / the stored id isn't one of the current options. */
export function resolveInstitutionPalette(themePalette: string | null | undefined): ThemePalette {
  return getPalette(themePalette);
}

/** Renders a palette's `vars` map as `--name: value;` CSS custom-property
 *  declarations — the body of a `:root { ... }` (or scoped selector)
 *  block. Used by every layout that injects a resolved palette via an
 *  inline `<style>` tag (Server Components can't reach `document` to set
 *  these client-side, and doing it server-side avoids any flash of the
 *  wrong colour on first paint). */
export function paletteCssVars(palette: ThemePalette): string {
  const v = palette.vars;
  return (
    `--background:${v.background};--foreground:${v.foreground};--heading:${v.heading ?? v.foreground};--surface:${v.surface};` +
    `--surface-muted:${v.surfaceMuted};--border-subtle:${v.borderSubtle};` +
    `--brand:${v.brand};--brand-hover:${v.brandHover};--brand-from:${v.brandFrom};` +
    `--brand-via:${v.brandVia};--brand-to:${v.brandTo};` +
    `--accent-teal:${v.accentTeal};--accent-teal-hover:${v.accentTealHover};` +
    `--sidebar-bg:${v.sidebarBg};--sidebar-bg-2:${v.sidebarBg2};--sidebar-active:${v.sidebarActive};` +
    `--sidebar-border:${v.sidebarBorder};--sidebar-text:${v.sidebarText};` +
    `--sidebar-text-muted:${v.sidebarTextMuted};--sidebar-icon:${v.sidebarIcon};` +
    `--sidebar-strong:${v.sidebarStrong ?? "#ffffff"};--sidebar-active-text:${v.sidebarActiveText ?? "#ffffff"};` +
    systemCssVars(palette.system)
  );
}

/** The optional full colour system as custom properties. globals.css's
 *  @theme points zinc/indigo/primary/ink/body/muted/shadows at these with
 *  the original values as fallbacks, so a palette without a system emits
 *  nothing here and renders exactly as it always has. */
function systemCssVars(s: PaletteSystem | undefined): string {
  if (!s) return "";
  let out = "";
  for (const [k, v] of Object.entries(s.brand)) out += `--sys-brand-${k}:${v};`;
  for (const [k, v] of Object.entries(s.neutral)) out += `--sys-neutral-${k}:${v};`;
  out += `--sys-muted:${s.text.muted};--sys-body:${s.text.body};--sys-ink:${s.text.ink};--sys-shadow-rgb:${s.shadowRgb};`;
  return out;
}
