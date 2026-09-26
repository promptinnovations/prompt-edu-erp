/**
 * PROMPT EDU ERP — shared marks/numeric display formatting.
 *
 * §"i observed marks are given like 100.00, 35.00, 64.00 -- it should be
 * just 100, 35, 64 etc." Root cause: `marks`, `exam_subjects.max_marks`,
 * `exam_subjects.pass_marks`, `results.total_marks`/`max_total_marks`, and
 * every other mark-like column are Postgres `numeric` — the pg driver
 * returns those as plain strings, verbatim, including the scale the column
 * was declared/computed with ("100.00", "35.00"), and every call site in
 * this app so far has interpolated that string straight into JSX or an
 * <input defaultValue> unchanged. This is purely a *display* concern —
 * NOT a computation bug, every one of these values is mathematically
 * correct — so this helper only ever runs at render time, never touches a
 * stored or computed value.
 *
 * formatMarks() strips trailing zeros (100.00 -> "100", 35.50 -> "35.5")
 * but keeps genuine fractional marks (33.33 stays "33.33") -- so it is safe
 * to use everywhere a mark/max-mark/pass-mark/total is displayed OR fed
 * into an <input defaultValue>, without losing any real precision a CE
 * component or half-mark scheme might use.
 */
export function formatMarks(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  // Up to 2 decimal places (matches every marks-like column's declared
  // scale in this schema), trailing zeros/dot trimmed -- careful not to
  // strip a genuine "0" (0.00 must stay "0", not become "").
  let s = n.toFixed(2);
  if (s.includes(".")) {
    s = s.replace(/0+$/, "").replace(/\.$/, "");
  }
  return s;
}
