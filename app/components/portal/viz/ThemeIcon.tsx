/**
 * §Palette-matching icons ("icons, charts, cards etc. in the app also need
 * to match the new colour combinations"): stat tiles and page headers used
 * full-colour emoji, which never match a colour theme. Each emoji those
 * blocks use maps to a simple line icon drawn in the tile's own (theme)
 * colour; anything not in the map still renders as the emoji, so no call
 * site has to change. Server-safe, plain SVG.
 */
const P: Record<string, string> = {
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>',
  box: '<path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m14 6 4 4"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M5 3 2.5 5.5M19 3l2.5 2.5"/>',
  hourglass: '<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9"/>',
  medal: '<circle cx="12" cy="15" r="5.5"/><path d="M8 3l4 6.5L16 3M12 12.5l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3Z"/>',
  books: '<path d="M4 4h5v16H4zM10 4h5v16h-5zM16.2 5.2l3.9 1-3.6 14.6-3.9-1"/>',
  backpack: '<rect x="5" y="8" width="14" height="13" rx="3.5"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8M9 14.5h6"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>',
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 15c2.3.1 4.2 1.5 5.2 4"/>',
  teacher: '<rect x="11" y="3.5" width="10" height="7.5" rx="1.5"/><circle cx="6.5" cy="9" r="3"/><path d="M1.5 20.5c.8-3.2 2.6-4.8 5-4.8s4.2 1.6 5 4.8M11 13l3-2"/>',
  staff: '<circle cx="12" cy="7.5" r="3.5"/><path d="M5 20.5c1-4 3.8-6 7-6s6 2 7 6M10.5 14.8 12 18l1.5-3.2"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>',
  flame: '<path d="M12 3c.8 3.8 5 5.2 5 10a5 5 0 0 1-10 0c0-2.8 1.8-4 2.2-6 1 1 1.6 2 2.6 2.2C12 7 11 5 12 3Z"/>',
  pin: '<path d="M9 3h6l-1 6 3.5 3.5h-11L10 9 9 3ZM12 12.5V21"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z"/>',
  thumbs: '<path d="M7 10.5V20H4v-9.5ZM7 10.5l4-7.5c1.2 0 2.3 1 2 2.3L12.3 10H18a2 2 0 0 1 2 2.3l-1.2 6A2.2 2.2 0 0 1 16.6 20H7"/>',
  school: '<path d="M3 21h18M5 21V10l7-5 7 5v11M10 21v-5h4v5"/><circle cx="12" cy="10.5" r="1.2"/>',
  trophy: '<path d="M8 21h8M12 16.5V21M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4.5a2.5 2.5 0 0 0 2.6 3.6M17 6h2.5a2.5 2.5 0 0 1-2.6 3.6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.8 0-1.2-1-1.6-1-2.6 0-.9.8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z"/><circle cx="7.5" cy="11" r="1.1"/><circle cx="10" cy="7" r="1.1"/><circle cx="15" cy="7" r="1.1"/>',
  sparkle: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M6 18l3-3M15 9l3-3"/>',
  warning: '<path d="M12 3.5 21.5 20h-19Z"/><path d="M12 10v4M12 17v.01"/>',
  leaf: '<path d="M12 21v-8M12 13c0-5 3.5-8.5 8.5-9 0 5.5-3.5 9-8.5 9ZM12 15.5c-.5-3.5-3-5.8-7-6 .2 4 2.8 6.2 7 6Z"/>',
};

const EMOJI: Record<string, keyof typeof P> = {
  "💳": "card", "📦": "box", "📝": "pencil", "✍️": "pencil", "✏️": "pencil", "⏰": "clock", "⏳": "hourglass",
  "🥇": "medal", "🥈": "medal", "🥉": "medal", "🏅": "medal", "📚": "books", "🎒": "backpack", "⭐": "star", "✦": "star",
  "✉️": "mail", "🧾": "receipt", "📜": "receipt", "🧭": "compass", "🧩": "grid", "🧑‍💼": "staff", "👩‍🏫": "teacher",
  "👥": "people", "🚫": "ban", "🔥": "flame", "📌": "pin", "📈": "trend", "📅": "calendar", "📂": "folder", "👍": "thumbs",
  "🏫": "school", "🏆": "trophy", "🎯": "target", "🎨": "palette", "🌸": "sparkle", "⚠️": "warning", "🗓️": "calendar", "📖": "books", "🌱": "leaf",
};

export default function ThemeIcon({ icon, color, size = 18 }: { icon: string; color: string; size?: number }) {
  const key = EMOJI[icon.trim()];
  if (!key) return <>{icon}</>;
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ stroke: color }}
      dangerouslySetInnerHTML={{ __html: P[key] }}
    />
  );
}
