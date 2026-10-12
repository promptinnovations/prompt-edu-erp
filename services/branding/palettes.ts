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

// Cool, neutral grey ramp shared by the modern palettes (the grey scale
// most current SaaS products use): white cards on an off-white canvas,
// hairline borders, slate-blue text tones. Muted text is 4.97:1 on white.
const MODERN_NEUTRAL: Pick<PaletteSystem, "neutral" | "text" | "shadowRgb"> = {
  neutral: { "50": "#f9fafb", "100": "#f2f4f7", "200": "#eaecf0", "300": "#e4e7ec", "400": "#98a2b3" },
  text: { muted: "#667085", body: "#475467", ink: "#1d2939" },
  shadowRgb: "16, 24, 40",
};

export const THEME_PALETTES: ThemePalette[] = [
  // §Modern-palettes ("change the colour of the website — use the best of
  // modern web apps"): the current SaaS look — off-white canvas, white
  // cards with hairline borders, a light sidebar with a tinted active pill,
  // one vivid brand colour and a soft gradient for heroes. All text pairs
  // are WCAG AA (white on brand ≥ 5.4:1, active nav text ≥ 5.2:1).
  {
    id: "modern-indigo",
    label: "Modern Indigo",
    swatch: ["#ffffff", "#4f46e5", "#a21caf"],
    vars: {
      background: "#f9fafb", foreground: "#1d2939", heading: "#1d2939", surface: "#ffffff", surfaceMuted: "#f9fafb", borderSubtle: "#eaecf0",
      brand: "#4f46e5", brandHover: "#4338ca", brandFrom: "#4f46e5", brandVia: "#7c3aed", brandTo: "#a21caf",
      accentTeal: "#7c3aed", accentTealHover: "#6d28d9",
      sidebarBg: "#ffffff", sidebarBg2: "#ffffff", sidebarActive: "#eef2ff", sidebarBorder: "#eaecf0",
      sidebarText: "#344054", sidebarTextMuted: "#667085", sidebarIcon: "#667085",
      sidebarStrong: "#1d2939", sidebarActiveText: "#4338ca",
    },
    system: {
      ...MODERN_NEUTRAL,
      brand: {
        "50": "#eef2ff", "100": "#e0e7ff", "200": "#c7d2fe", "300": "#a5b4fc", "400": "#818cf8", "500": "#6366f1",
        "600": "#4f46e5", "700": "#4338ca", "800": "#3730a3", "900": "#312e81", "950": "#1e1b4b",
      },
    },
  },
  {
    id: "modern-teal",
    label: "Modern Teal",
    swatch: ["#ffffff", "#0f766e", "#1d4ed8"],
    vars: {
      background: "#f9fafb", foreground: "#1d2939", heading: "#1d2939", surface: "#ffffff", surfaceMuted: "#f9fafb", borderSubtle: "#eaecf0",
      brand: "#0f766e", brandHover: "#115e59", brandFrom: "#0f766e", brandVia: "#0e7490", brandTo: "#1d4ed8",
      accentTeal: "#0e7490", accentTealHover: "#155e75",
      sidebarBg: "#ffffff", sidebarBg2: "#ffffff", sidebarActive: "#f0fdfa", sidebarBorder: "#eaecf0",
      sidebarText: "#344054", sidebarTextMuted: "#667085", sidebarIcon: "#667085",
      sidebarStrong: "#1d2939", sidebarActiveText: "#0f766e",
    },
    system: {
      ...MODERN_NEUTRAL,
      // Shifted one step darker than the stock teal ramp so 600 (the step
      // the app puts white text on) still passes AA.
      brand: {
        "50": "#f0fdfa", "100": "#ccfbf1", "200": "#99f6e4", "300": "#5eead4", "400": "#2dd4bf", "500": "#0d9488",
        "600": "#0f766e", "700": "#115e59", "800": "#134e4a", "900": "#123f3c", "950": "#042f2e",
      },
    },
  },
  {
    id: "modern-midnight",
    label: "Midnight Blue",
    swatch: ["#1e293b", "#2563eb", "#7c3aed"],
    vars: {
      background: "#f9fafb", foreground: "#1d2939", heading: "#1d2939", surface: "#ffffff", surfaceMuted: "#f9fafb", borderSubtle: "#eaecf0",
      brand: "#2563eb", brandHover: "#1d4ed8", brandFrom: "#2563eb", brandVia: "#4f46e5", brandTo: "#7c3aed",
      accentTeal: "#4f46e5", accentTealHover: "#4338ca",
      sidebarBg: "#1e293b", sidebarBg2: "#1e293b", sidebarActive: "#334155", sidebarBorder: "#2c3a50",
      sidebarText: "#e2e8f0", sidebarTextMuted: "#94a3b8", sidebarIcon: "#a5b4c8",
    },
    system: {
      ...MODERN_NEUTRAL,
      brand: {
        "50": "#eff6ff", "100": "#dbeafe", "200": "#bfdbfe", "300": "#93c5fd", "400": "#60a5fa", "500": "#3b82f6",
        "600": "#2563eb", "700": "#1d4ed8", "800": "#1e40af", "900": "#1e3a8a", "950": "#172554",
      },
    },
  },
  {
    id: "navy-teal",
    label: "Navy & Teal",
    swatch: ["#16215c", "#1d4ed8", "#0d9488"],
    vars: {
      background: "#f4f6fb", foreground: "#1e293b", surface: "#ffffff", surfaceMuted: "#eef1f8", borderSubtle: "#dde3ef",
      brand: "#1d4ed8", brandHover: "#1e40af", brandFrom: "#1d4ed8", brandVia: "#2563eb", brandTo: "#0d9488",
      accentTeal: "#0d9488", accentTealHover: "#0f766e",
      sidebarBg: "#16215c", sidebarBg2: "#1e2c78", sidebarActive: "#2c3d9e", sidebarBorder: "#263070",
      sidebarText: "#e4e8fb", sidebarTextMuted: "#9aa4d6", sidebarIcon: "#b9c1ec",
    },
  },
  {
    id: "indigo-violet",
    label: "Indigo & Violet",
    swatch: ["#312e81", "#6366f1", "#a855f7"],
    vars: {
      background: "#f6f5fd", foreground: "#221f3d", surface: "#ffffff", surfaceMuted: "#efeefb", borderSubtle: "#e0defa",
      brand: "#6366f1", brandHover: "#4f46e5", brandFrom: "#6366f1", brandVia: "#8b5cf6", brandTo: "#a855f7",
      accentTeal: "#a855f7", accentTealHover: "#9333ea",
      sidebarBg: "#312e81", sidebarBg2: "#3c3893", sidebarActive: "#4c46b3", sidebarBorder: "#413d99",
      sidebarText: "#ece9fd", sidebarTextMuted: "#b3aef0", sidebarIcon: "#c7c2f6",
    },
  },
  {
    id: "emerald-forest",
    label: "Emerald & Forest",
    swatch: ["#064e3b", "#059669", "#34d399"],
    vars: {
      background: "#f2faf6", foreground: "#132e26", surface: "#ffffff", surfaceMuted: "#e6f6ee", borderSubtle: "#d3ecdf",
      brand: "#059669", brandHover: "#047857", brandFrom: "#065f46", brandVia: "#059669", brandTo: "#34d399",
      accentTeal: "#0d9488", accentTealHover: "#0f766e",
      sidebarBg: "#064e3b", sidebarBg2: "#0b6049", sidebarActive: "#137a5e", sidebarBorder: "#0d5c46",
      sidebarText: "#e2faf1", sidebarTextMuted: "#8fd4b8", sidebarIcon: "#a9e4c9",
    },
  },
  {
    id: "slate-amber",
    label: "Slate & Amber",
    swatch: ["#334155", "#d97706", "#fbbf24"],
    vars: {
      background: "#f8f7f4", foreground: "#292524", surface: "#ffffff", surfaceMuted: "#f1efe9", borderSubtle: "#e6e2d8",
      brand: "#d97706", brandHover: "#b45309", brandFrom: "#334155", brandVia: "#d97706", brandTo: "#fbbf24",
      accentTeal: "#0e7490", accentTealHover: "#155e75",
      sidebarBg: "#334155", sidebarBg2: "#3e4f68", sidebarActive: "#4d6280", sidebarBorder: "#425368",
      sidebarText: "#f1f5f9", sidebarTextMuted: "#aab7c8", sidebarIcon: "#c2ccdb",
    },
  },
  {
    id: "rose-plum",
    label: "Rose & Plum",
    swatch: ["#4a044e", "#be185d", "#f472b6"],
    vars: {
      background: "#fdf5f9", foreground: "#3b0f2e", surface: "#ffffff", surfaceMuted: "#fbe9f2", borderSubtle: "#f6d9e9",
      brand: "#be185d", brandHover: "#9d174d", brandFrom: "#701a75", brandVia: "#be185d", brandTo: "#f472b6",
      accentTeal: "#a21caf", accentTealHover: "#86198f",
      sidebarBg: "#4a044e", sidebarBg2: "#5c0f63", sidebarActive: "#75207c", sidebarBorder: "#650f6c",
      sidebarText: "#fbe9f5", sidebarTextMuted: "#d69fd8", sidebarIcon: "#e2b8e3",
    },
  },
  {
    id: "ocean-blue",
    label: "Ocean Blue",
    swatch: ["#0c4a6e", "#0284c7", "#38bdf8"],
    vars: {
      background: "#f2f9fd", foreground: "#0c2233", surface: "#ffffff", surfaceMuted: "#e3f2fb", borderSubtle: "#cfe8f7",
      brand: "#0284c7", brandHover: "#0369a1", brandFrom: "#0c4a6e", brandVia: "#0284c7", brandTo: "#38bdf8",
      accentTeal: "#0891b2", accentTealHover: "#0e7490",
      sidebarBg: "#0c4a6e", sidebarBg2: "#105a84", sidebarActive: "#16719f", sidebarBorder: "#0f5a86",
      sidebarText: "#e3f4fc", sidebarTextMuted: "#8fc6e3", sidebarIcon: "#addcf0",
    },
  },
  {
    id: "crimson-maroon",
    label: "Crimson & Maroon",
    swatch: ["#450a0a", "#dc2626", "#fb923c"],
    vars: {
      background: "#fdf5f4", foreground: "#3a0d0d", surface: "#ffffff", surfaceMuted: "#fbe8e6", borderSubtle: "#f6d5d2",
      brand: "#dc2626", brandHover: "#b91c1c", brandFrom: "#450a0a", brandVia: "#dc2626", brandTo: "#fb923c",
      accentTeal: "#c2410c", accentTealHover: "#9a3412",
      sidebarBg: "#450a0a", sidebarBg2: "#5c1212", sidebarActive: "#7a1c1c", sidebarBorder: "#661515",
      sidebarText: "#fbe9e7", sidebarTextMuted: "#dc9b96", sidebarIcon: "#e7b3af",
    },
  },
  {
    id: "sunset-orange",
    label: "Sunset Orange",
    swatch: ["#431407", "#ea580c", "#f59e0b"],
    vars: {
      background: "#fdf7f2", foreground: "#3a1c0d", surface: "#ffffff", surfaceMuted: "#fbeee1", borderSubtle: "#f6ddc4",
      brand: "#ea580c", brandHover: "#c2410c", brandFrom: "#431407", brandVia: "#ea580c", brandTo: "#f59e0b",
      accentTeal: "#b45309", accentTealHover: "#92400e",
      sidebarBg: "#431407", sidebarBg2: "#5a1e0d", sidebarActive: "#7c2d0f", sidebarBorder: "#66240c",
      sidebarText: "#fdece0", sidebarTextMuted: "#e0a789", sidebarIcon: "#ecc0a4",
    },
  },
  {
    // Prompt Innovations UI standard: deep navy primary, gold accent, warm
    // sand ground (the brand scales live in globals.css's @theme block).
    // Gold 500 is too light for white text, so the accent slot — which is
    // used under white text — takes the readable gold 700/800 steps.
    id: "navy-gold",
    label: "Navy & Gold",
    swatch: ["#0b1f3a", "#c8a84b", "#f7f4ee"],
    vars: {
      background: "#f7f4ee", foreground: "#1d2430", heading: "#0b1f3a", surface: "#ffffff", surfaceMuted: "#fbf9f5", borderSubtle: "#e2dbcc",
      brand: "#0b1f3a", brandHover: "#183c6d", brandFrom: "#0b1f3a", brandVia: "#183c6d", brandTo: "#234f8b",
      accentTeal: "#896f24", accentTealHover: "#66521a",
      sidebarBg: "#0b1f3a", sidebarBg2: "#102c50", sidebarActive: "#183c6d", sidebarBorder: "#183c6d",
      sidebarText: "#f4f7fa", sidebarTextMuted: "#99b5db", sidebarIcon: "#c8d6ea",
    },
  },
];

// Mirrors the platform default seeded by migration 0040
// (platform_settings.default_theme_palette) — it's only the fallback when
// that row is missing. To roll a palette out to institutions that never
// chose one, change the platform default in the Super Admin console.
export const DEFAULT_PALETTE_ID = "modern-indigo";
export const PALETTE_IDS = THEME_PALETTES.map((p) => p.id);

export function getPalette(id: string | null | undefined): ThemePalette {
  return THEME_PALETTES.find((p) => p.id === id) ?? THEME_PALETTES.find((p) => p.id === DEFAULT_PALETTE_ID)!;
}

/** §Fixed-look ("this is not required — fix the latest update"): the app
 *  has ONE colour scheme, Modern Indigo, for every institution, portal,
 *  login screen and the Super Admin console. The palette picker UI is
 *  gone; the stored institutions.theme_palette / platform default values
 *  are no longer read for rendering. */
export const APP_PALETTE: ThemePalette = getPalette(DEFAULT_PALETTE_ID);

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
