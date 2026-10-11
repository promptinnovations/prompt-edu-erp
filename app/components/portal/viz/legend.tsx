/** Legend row for ≥2 series / categories (identity never by colour alone). */
export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={i.dashed ? { border: `2px dashed ${i.color}` } : { backgroundColor: i.color }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

