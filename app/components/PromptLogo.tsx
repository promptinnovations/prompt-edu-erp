/**
 * §Brand-logo ("I will go with Scholar Hall — let it be the logo of the
 * app; each institute will have a separate logo, which will be the icon of
 * their institute's app; where the tag of the original app shows, use this
 * one"): the PROMPT EDU ERP product mark — a graduation cap as the roof of
 * an institution on three pillars, with a coral tassel.
 *
 * It is the PLATFORM brand: the generic login, the Super Admin console,
 * the "PROMPT EDU ERP · Prompt Innovations" credit lines, "Powered by" on
 * documents, the price calculator and the generic install icon. Inside an
 * institution's own app its own logo (Settings → Logo) stays the identity
 * and its app icon. The mark keeps its own Scholar Teal colours whatever
 * colour theme an institution picks. Plain inline SVG, no ids — safe to
 * render any number of times on a page, in Server or Client Components.
 */
type Variant = "full" | "white" | "mono";

const COLOURS: Record<Variant, { roof: string; band: string; pillar: string; pillarMid: string; base: string; tassel: string }> = {
  full: { roof: "#0F766E", band: "#0B5550", pillar: "#3FA79E", pillarMid: "#0F766E", base: "#0B5550", tassel: "#F97316" },
  white: { roof: "#FFFFFF", band: "#E6F5F3", pillar: "#BFE6E1", pillarMid: "#FFFFFF", base: "#E6F5F3", tassel: "#FDBA74" },
  mono: { roof: "currentColor", band: "currentColor", pillar: "currentColor", pillarMid: "currentColor", base: "currentColor", tassel: "currentColor" },
};

export function PromptMark({ size = 24, variant = "full", className, title }: { size?: number; variant?: Variant; className?: string; title?: string }) {
  const c = COLOURS[variant];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path d="M32 5 59 16 32 27 5 16Z" fill={c.roof} />
      <path d="M14 21.2 32 28.6 50 21.2V27c0 3.3-8 6.2-18 6.2S14 30.3 14 27Z" fill={c.band} />
      <path d="M55.5 17.6V28.5" stroke={c.tassel} strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="55.5" cy="31.4" r="3.4" fill={c.tassel} />
      <rect x="15" y="34.5" width="8.5" height="17" rx="2.6" fill={c.pillar} />
      <rect x="27.75" y="34.5" width="8.5" height="17" rx="2.6" fill={c.pillarMid} />
      <rect x="40.5" y="34.5" width="8.5" height="17" rx="2.6" fill={c.pillar} />
      <rect x="9" y="53" width="46" height="6" rx="3" fill={c.base} />
    </svg>
  );
}

/** The mark on its teal app-icon tile (used where a square badge is expected). */
export function PromptAppTile({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size, borderRadius: size * 0.26, background: "linear-gradient(140deg,#13968C 0%,#0F766E 45%,#0B5550 100%)" }}
      aria-hidden="true"
    >
      <PromptMark size={Math.round(size * 0.68)} variant="white" />
    </span>
  );
}

/** "PROMPT EDU ERP · Prompt Innovations" credit with the mark in front. */
export function PromptCredit({ className = "", markSize = 14, light = false, text = "PROMPT EDU ERP · Prompt Innovations" }: { className?: string; markSize?: number; light?: boolean; text?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <PromptMark size={markSize} variant={light ? "white" : "full"} />
      <span>{text}</span>
    </span>
  );
}
