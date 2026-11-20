/**
 * §App-icon ("app icon of an institute must be their logo; if not available
 * it must be their short name in the app colour box"): the short name shown
 * inside the colour box wherever an institution has no logo — its installed
 * app icon / favicon, the sidebar badge, the portal header and its login
 * screen. Pure and client-safe.
 *
 *  - a short institution code (2–4 letters, e.g. "ics") is the short name
 *    itself → "ICS";
 *  - otherwise the initials of the institution's name, skipping little
 *    words ("Badrudhuja Islamic Academy" → "BIA"), up to 4 letters;
 *  - a one-word name falls back to the first 3 letters of the code.
 */
const LITTLE_WORDS = new Set(["THE", "OF", "AND", "FOR", "AT", "IN", "A", "AN", "&"]);

export function institutionShortLabel(code: string | null | undefined, name: string | null | undefined): string {
  const c = (code ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (c.length >= 2 && c.length <= 4) return c;
  const words = (name ?? "")
    .toUpperCase()
    .split(/[\s\-_.,/()]+/)
    .filter((w) => w && !LITTLE_WORDS.has(w));
  const initials = words.map((w) => w.replace(/[^A-Z0-9]/g, "").charAt(0)).filter(Boolean).join("").slice(0, 4);
  if (initials.length >= 2) return initials;
  if (c.length >= 2) return c.slice(0, 3);
  return (initials || c || "P").slice(0, 3);
}
