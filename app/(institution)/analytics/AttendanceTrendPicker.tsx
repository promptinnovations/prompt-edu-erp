import { monthsAgoIST } from "../../../services/datetime/ist";

/** §Attendance-trend-redesign, revised ("give a load button here for loading
 *  after selecting required areas — months and classes should not be
 *  buttons, default latest must be open first").
 *
 *  The previous version made every class and month a pill <Link>, so each
 *  toggle was its own page navigation — picking three classes across four
 *  months meant seven round trips. This is a plain GET form instead:
 *  checkbox groups for the (multi-select) classes and months, a radio group
 *  for the single-choice division, and ONE "Load trend" submit. Checkboxes
 *  rather than a native <select multiple>, which is close to unusable on a
 *  phone — these stay touch-friendly and show every option at a glance.
 *  Still no client component: it posts to the same `trendClassIds` /
 *  `trendSectionId` / `trendMonths` query params the page already reads, so
 *  a loaded trend is still a shareable, printable URL.
 *
 *  `examinationId` and `tab` ride along as hidden fields so loading a trend
 *  doesn't reset the examination or Result Analysis tab selected above (a
 *  GET form replaces the whole query string). */
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

const CHECKBOX_LABEL =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--brand)]/5 has-[:checked]:font-medium has-[:checked]:text-[var(--brand)]";

export default function AttendanceTrendPicker({
  classes,
  sections,
  classIds,
  sectionId,
  months,
  examinationId,
  tab,
}: {
  classes: Array<{ id: string; name: string }>;
  sections: Array<{ id: string; class_id: string; name: string }>;
  classIds: string[];
  sectionId: string;
  months: string[];
  examinationId: string;
  tab: string;
}) {
  // Last 12 months, most recent first — a plain, predictable window rather
  // than an extra query just to discover which months hold data.
  const availableMonths = Array.from({ length: 12 }, (_, i) => monthsAgoIST(i));
  const selectedClasses = new Set(classIds);
  const selectedMonths = new Set(months);
  const filteredSections = sections.filter((s) => classIds.length === 0 || classIds.includes(s.class_id));

  return (
    <form method="get" className="space-y-4">
      <input type="hidden" name="examinationId" value={examinationId} />
      <input type="hidden" name="tab" value={tab} />

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-1.5 text-xs text-zinc-500">Classes</legend>
          <div className="flex flex-wrap gap-1.5">
            {classes.length === 0 ? <p className="text-sm text-zinc-500">No classes yet.</p> : null}
            {classes.map((c) => (
              <label key={c.id} className={CHECKBOX_LABEL}>
                <input
                  type="checkbox"
                  name="trendClassIds"
                  value={c.id}
                  defaultChecked={selectedClasses.has(c.id)}
                  className="h-3.5 w-3.5 accent-[var(--brand)]"
                />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-xs text-zinc-500">Months</legend>
          <div className="flex flex-wrap gap-1.5">
            {availableMonths.map((m) => (
              <label key={m} className={CHECKBOX_LABEL}>
                <input
                  type="checkbox"
                  name="trendMonths"
                  value={m}
                  defaultChecked={selectedMonths.has(m)}
                  className="h-3.5 w-3.5 accent-[var(--brand)]"
                />
                {monthLabel(m)}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs text-zinc-500">Division</legend>
        <div className="flex flex-wrap gap-1.5">
          <label className={CHECKBOX_LABEL}>
            <input type="radio" name="trendSectionId" value="" defaultChecked={sectionId === ""} className="h-3.5 w-3.5 accent-[var(--brand)]" />
            All divisions
          </label>
          {filteredSections.map((s) => (
            <label key={s.id} className={CHECKBOX_LABEL}>
              <input type="radio" name="trendSectionId" value={s.id} defaultChecked={sectionId === s.id} className="h-3.5 w-3.5 accent-[var(--brand)]" />
              {s.name}
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        className="rounded-full bg-[var(--brand)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--brand-hover)]"
      >
        Load trend
      </button>
    </form>
  );
}
